"""District 2 Intelligence Dashboard — FastAPI Application."""

import asyncio
import logging
import os
import sys

# Ensure backend is on the path
sys.path.insert(0, os.path.dirname(__file__))

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

from config import (
    DATASETS,
    HOST,
    NYC_OPENDATA_BASE,
    PORT,
    SOCRATA_HEADERS,
)
from db import init_db, query, execute
from scheduler import check_needs_backfill, run_backfill, setup_scheduler
from services.complaints import (
    get_311_top_issues,
    get_311_trend,
    get_911_type_breakdown,
    get_complaint_summary,
)
from services.hpd import (
    get_building_detail,
    get_hpd_complaint_categories,
    get_top_offenders,
    get_violation_summary,
    get_violation_trend,
)
from services.news import get_district_news, get_epstein_feed
from services.social import get_social_config
import auth

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting District 2 Dashboard...")
    await init_db()

    needs_backfill = await check_needs_backfill()
    setup_scheduler()

    if needs_backfill:
        logger.info("Empty database detected — starting backfill in background")
        asyncio.create_task(run_backfill())

    yield

    from scheduler import scheduler
    scheduler.shutdown(wait=False)
    logger.info("Dashboard shut down")


app = FastAPI(
    title="District 2 Intelligence Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Auth Middleware ──────────────────────────────────────────────────────────

PUBLIC_PATHS = {"/login", "/auth/login", "/favicon.ico", "/api/status"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Public paths — no auth needed
        if path in PUBLIC_PATHS:
            return await call_next(request)

        # Internal worker token auth
        if path.startswith("/api/internal/"):
            worker_token = os.environ.get("WORKER_TOKEN", "")
            auth_header = request.headers.get("authorization", "")
            if worker_token and auth_header == f"Bearer {worker_token}":
                request.state.user = {"id": 0, "username": "worker", "role": "worker"}
                return await call_next(request)
            return JSONResponse({"error": "Not authenticated"}, status_code=401)

        # Get session from cookie
        token = request.cookies.get("session")
        user = None
        if token:
            user = await auth.validate_session(token)

        if not user:
            # API requests get 401, page requests get redirected
            if path.startswith("/api/") or path.startswith("/auth/") or path.startswith("/admin/api/"):
                return JSONResponse({"error": "Not authenticated"}, status_code=401)
            return RedirectResponse("/login", status_code=302)

        # Admin-only paths
        if path.startswith("/admin") and user["role"] != "admin":
            return RedirectResponse("/", status_code=302)

        # Project access check for /district2
        if path == "/district2":
            has_access = await auth.user_has_project_access(user["id"], user["role"], "district2")
            if not has_access:
                return RedirectResponse("/", status_code=302)

        # Project access check for /suggestions
        if path == "/suggestions":
            has_access = await auth.user_has_project_access(user["id"], user["role"], "suggestions")
            if not has_access:
                return RedirectResponse("/", status_code=302)

        request.state.user = user
        return await call_next(request)


app.add_middleware(AuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://whatisms.com"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
pages_dir = os.path.join(frontend_dir, "pages")
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


# ── Frontend Pages ──────────────────────────────────────────────────────────

@app.get("/login")
async def login_page():
    return FileResponse(os.path.join(pages_dir, "login.html"))


@app.get("/")
async def portal_page():
    return FileResponse(os.path.join(pages_dir, "portal.html"))


@app.get("/district2")
async def district2_page():
    return FileResponse(os.path.join(frontend_dir, "index.html"))


@app.get("/admin")
async def admin_page():
    return FileResponse(os.path.join(pages_dir, "admin.html"))


# ── Auth API ────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str
    remember: bool = False


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


@app.post("/auth/login")
async def auth_login(req: LoginRequest):
    user = await auth.authenticate_user(req.username, req.password)
    if not user:
        return JSONResponse({"error": "Invalid username or password"}, status_code=401)
    token = await auth.create_session(user["id"], remember=req.remember)
    days = 30 if req.remember else 7
    is_prod = os.environ.get("HOST", "127.0.0.1") == "0.0.0.0"
    response = JSONResponse({"user": user})
    response.set_cookie(
        "session", token,
        httponly=True,
        secure=is_prod,
        max_age=days * 86400,
        samesite="lax",
        path="/",
    )
    return response


@app.post("/auth/logout")
async def auth_logout(request: Request):
    token = request.cookies.get("session")
    if token:
        await auth.delete_session(token)
    response = JSONResponse({"ok": True})
    response.delete_cookie("session", path="/")
    return response


@app.get("/auth/me")
async def auth_me(request: Request):
    user = request.state.user
    projects = await auth.get_user_projects(user["id"], user["role"])
    return {"user": user, "projects": projects}


@app.post("/auth/password")
async def auth_change_password(request: Request, req: PasswordChangeRequest):
    user = request.state.user
    ok = await auth.change_password(user["id"], req.old_password, req.new_password)
    if not ok:
        return JSONResponse({"error": "Current password is incorrect"}, status_code=400)
    return {"ok": True}


# ── Admin API ───────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    project_ids: list[int] = []


class UpdateProjectsRequest(BaseModel):
    project_ids: list[int]


@app.get("/admin/api/users")
async def admin_list_users():
    return await auth.list_users()


@app.post("/admin/api/users")
async def admin_create_user(req: CreateUserRequest):
    try:
        user = await auth.create_user(req.username, req.password, req.role, req.project_ids)
        return user
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.put("/admin/api/users/{user_id}/projects")
async def admin_update_user_projects(user_id: int, req: UpdateProjectsRequest):
    await auth.set_user_projects(user_id, req.project_ids)
    return {"ok": True}


@app.delete("/admin/api/users/{user_id}")
async def admin_delete_user(user_id: int):
    ok = await auth.delete_user(user_id)
    if not ok:
        return JSONResponse({"error": "Cannot delete the last admin"}, status_code=400)
    return {"ok": True}


@app.get("/admin/api/projects")
async def admin_list_projects():
    return await auth.list_projects()


# ── Suggestions Page + API ────────────────────────────────────────────────────

@app.get("/suggestions")
async def suggestions_page():
    return FileResponse(os.path.join(pages_dir, "suggestions.html"))


class SuggestionCreate(BaseModel):
    suggestion_text: str = Field(..., min_length=1, max_length=5000)


@app.post("/api/suggestions")
async def create_suggestion(req: SuggestionCreate, request: Request):
    user = request.state.user
    has_access = await auth.user_has_project_access(user["id"], user["role"], "suggestions")
    if not has_access:
        return JSONResponse({"error": "No access"}, status_code=403)
    await execute(
        "INSERT INTO suggestions (user_id, suggestion_text) VALUES (?, ?)",
        (user["id"], req.suggestion_text),
    )
    result = await query("SELECT * FROM suggestions ORDER BY id DESC LIMIT 1")
    return result[0] if result else {"error": "Failed to create suggestion"}


@app.get("/api/suggestions")
async def list_suggestions(request: Request):
    user = request.state.user
    has_access = await auth.user_has_project_access(user["id"], user["role"], "suggestions")
    if not has_access:
        return JSONResponse({"error": "No access"}, status_code=403)
    return await query(
        """SELECT s.id, s.suggestion_text, s.status, s.claude_output,
                  s.created_at, s.processed_at, u.username
           FROM suggestions s JOIN users u ON s.user_id = u.id
           ORDER BY s.created_at DESC"""
    )


@app.get("/api/internal/suggestions/pending")
async def get_pending_suggestion():
    rows = await query(
        "SELECT * FROM suggestions WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    )
    return rows[0] if rows else None


class SuggestionUpdate(BaseModel):
    status: str
    claude_output: str | None = None


@app.put("/api/internal/suggestions/{suggestion_id}")
async def update_suggestion(suggestion_id: int, req: SuggestionUpdate):
    await execute(
        "UPDATE suggestions SET status = ?, claude_output = ?, processed_at = datetime('now') WHERE id = ?",
        (req.status, req.claude_output, suggestion_id),
    )
    result = await query("SELECT * FROM suggestions WHERE id = ?", (suggestion_id,))
    return result[0] if result else {"error": "Suggestion not found"}


# ── Pin Map API ──────────────────────────────────────────────────────────────


class PinCreate(BaseModel):
    latitude: float = Field(ge=40.0, le=41.0)
    longitude: float = Field(ge=-74.5, le=-73.0)
    address: str | None = Field(None, max_length=500)
    description: str | None = Field(None, max_length=2000)
    tag: str = Field("General", max_length=100)


class PinUpdate(BaseModel):
    latitude: float | None = Field(None, ge=40.0, le=41.0)
    longitude: float | None = Field(None, ge=-74.5, le=-73.0)
    address: str | None = Field(None, max_length=500)
    description: str | None = Field(None, max_length=2000)
    tag: str | None = Field(None, max_length=100)


class TagCreate(BaseModel):
    name: str = Field(max_length=100)
    icon: str = Field("map-pin", max_length=50)
    color: str = Field("#9f4ff7", max_length=20)


@app.get("/api/pins")
async def get_pins(tag: str = Query(None)):
    """List all pins, optionally filtered by tag."""
    if tag:
        return await query(
            "SELECT * FROM map_pins WHERE tag = ? ORDER BY created_at DESC", (tag,)
        )
    return await query("SELECT * FROM map_pins ORDER BY created_at DESC")


@app.post("/api/pins")
async def create_pin(pin: PinCreate):
    """Create a new pin."""
    await execute(
        "INSERT INTO map_pins (latitude, longitude, address, description, tag) VALUES (?, ?, ?, ?, ?)",
        (pin.latitude, pin.longitude, pin.address, pin.description, pin.tag),
    )
    result = await query(
        "SELECT * FROM map_pins ORDER BY id DESC LIMIT 1"
    )
    return result[0] if result else {"error": "Failed to create pin"}


@app.put("/api/pins/{pin_id}")
async def update_pin(pin_id: int, pin: PinUpdate):
    """Update an existing pin."""
    updates = []
    params = []
    for field in ("latitude", "longitude", "address", "description", "tag"):
        val = getattr(pin, field)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)
    if not updates:
        return {"error": "No fields to update"}
    updates.append("updated_at = datetime('now')")
    params.append(pin_id)
    await execute(
        f"UPDATE map_pins SET {', '.join(updates)} WHERE id = ?", tuple(params)
    )
    result = await query("SELECT * FROM map_pins WHERE id = ?", (pin_id,))
    return result[0] if result else {"error": "Pin not found"}


@app.delete("/api/pins/{pin_id}")
async def delete_pin(pin_id: int):
    """Delete a pin."""
    await execute("DELETE FROM map_pins WHERE id = ?", (pin_id,))
    return {"ok": True}


@app.get("/api/pins/tags")
async def get_pin_tags():
    """List all pin tags."""
    return await query("SELECT * FROM pin_tags ORDER BY is_custom, name")


@app.post("/api/pins/tags")
async def create_pin_tag(tag: TagCreate):
    """Create a custom tag."""
    await execute(
        "INSERT OR IGNORE INTO pin_tags (name, icon, color, is_custom) VALUES (?, ?, ?, 1)",
        (tag.name, tag.icon, tag.color),
    )
    result = await query("SELECT * FROM pin_tags WHERE name = ?", (tag.name,))
    return result[0] if result else {"error": "Failed to create tag"}


@app.delete("/api/pins/tags/{tag_name}")
async def delete_pin_tag(tag_name: str):
    """Delete a custom tag (only if is_custom=1)."""
    result = await query(
        "SELECT is_custom FROM pin_tags WHERE name = ?", (tag_name,)
    )
    if not result:
        return JSONResponse({"error": "Tag not found"}, status_code=404)
    if not result[0]["is_custom"]:
        return JSONResponse({"error": "Cannot delete built-in tag"}, status_code=400)
    await execute("DELETE FROM pin_tags WHERE name = ? AND is_custom = 1", (tag_name,))
    return {"ok": True}


@app.get("/api/geocode")
async def geocode_address(address: str = Query(...)):
    """Geocode an address using Nominatim (OpenStreetMap), scoped to NYC."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{address}, New York City, NY",
                    "format": "json",
                    "limit": 5,
                    "viewbox": "-74.05,40.68,-73.90,40.88",
                    "bounded": 1,
                },
                headers={"User-Agent": "District2Dashboard/1.0"},
            )
            resp.raise_for_status()
            results = resp.json()
        return [
            {
                "display_name": r.get("display_name", ""),
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"Geocode failed: {e}")
        return []


# ── District Boundary ────────────────────────────────────────────────────────

@app.get("/api/district/boundary")
async def get_district_boundary():
    """Fetch District 2 GeoJSON boundary from NYC Open Data."""
    url = f"{NYC_OPENDATA_BASE}/{DATASETS['council_districts_geo']}.geojson?$where=coundist='2'"
    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            geojson = resp.json()

        features = geojson.get("features", [])
        geojson["features"] = features
        return geojson
    except Exception as e:
        logger.error(f"Failed to fetch district boundary: {e}")
        return {"type": "FeatureCollection", "features": []}


# ── 311 / 911 Analysis API ──────────────────────────────────────────────────

@app.get("/api/complaints/311/top-issues")
async def api_311_top_issues(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
    limit: int = Query(15, le=50),
):
    return await get_311_top_issues(period, limit)


@app.get("/api/complaints/311/trend")
async def api_311_trend(
    complaint_type: str = Query(None),
    months: int = Query(6, ge=1, le=24),
):
    return await get_311_trend(complaint_type, months)


@app.get("/api/complaints/311/summary")
async def api_311_summary(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_complaint_summary(period)


@app.get("/api/complaints/911/breakdown")
async def api_911_breakdown(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_911_type_breakdown(period)


@app.get("/api/complaints/311/all")
async def api_311_all(
    limit: int = Query(200, le=2000),
    offset: int = Query(0),
    complaint_type: str = Query(None),
):
    """Raw 311 complaint data table."""
    conditions = ["1=1"]
    params = []
    if complaint_type:
        conditions.append("complaint_type = ?")
        params.append(complaint_type)

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    return await query(
        f"""
        SELECT unique_key, created_date, closed_date, complaint_type, descriptor,
               address, city, status, latitude, longitude
        FROM complaints_311
        WHERE {where}
        ORDER BY created_date DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params),
    )


# ── Harvey Epstein Feed API ─────────────────────────────────────────────────

@app.get("/api/epstein/feed")
async def api_epstein_feed(limit: int = Query(50, le=200)):
    return await get_epstein_feed(limit)


@app.get("/api/epstein/social")
async def api_epstein_social():
    return get_social_config()


@app.get("/api/news/district")
async def api_district_news(limit: int = Query(50, le=200)):
    return await get_district_news(limit)


# ── HPD Violations API ───────────────────────────────────────────────────────

@app.get("/api/hpd/violations/summary")
async def api_hpd_summary(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
    from_date: str = Query(None),
    to_date: str = Query(None),
):
    return await get_violation_summary(period, from_date, to_date)


@app.get("/api/hpd/violations/trend")
async def api_hpd_trend(
    months: int = Query(6, ge=1, le=24),
    from_date: str = Query(None),
    to_date: str = Query(None),
):
    return await get_violation_trend(months, from_date, to_date)


@app.get("/api/hpd/violations/offenders")
async def api_hpd_offenders(
    limit: int = Query(20, le=100),
    from_date: str = Query(None),
    to_date: str = Query(None),
):
    return await get_top_offenders(limit, from_date, to_date)


@app.get("/api/hpd/complaints/categories")
async def api_hpd_complaint_cats(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_hpd_complaint_categories(period)


@app.get("/api/hpd/building/{building_id}")
async def api_building_detail(building_id: str):
    return await get_building_detail(building_id)


@app.get("/api/hpd/violations/all")
async def api_hpd_violations_all(
    limit: int = Query(200, le=2000),
    offset: int = Query(0),
    violation_class: str = Query(None),
    from_date: str = Query(None),
    to_date: str = Query(None),
):
    """Raw HPD violations data table."""
    conditions = ["1=1"]
    params = []
    if violation_class:
        conditions.append("class = ?")
        params.append(violation_class)
    if from_date:
        conditions.append("inspection_date >= ?")
        params.append(from_date)
    if to_date:
        conditions.append("inspection_date <= ?")
        params.append(to_date)

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    return await query(
        f"""
        SELECT violation_id, building_id, borough,
               house_number || ' ' || street_name as address,
               zip, class, inspection_date, nov_description,
               current_status, current_status_date,
               owner_name, latitude, longitude
        FROM hpd_violations
        WHERE {where}
        ORDER BY inspection_date DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params),
    )


# ── Events API (map data) ───────────────────────────────────────────────────

@app.get("/api/events")
async def api_events(
    event_type: str = Query(None),
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(500, le=2000),
):
    """Recent events for the map."""
    conditions = ["occurred_at >= datetime('now', ?  || ' hours')"]
    params = [str(-hours)]
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)
    where = " AND ".join(conditions)
    params.append(limit)
    return await query(
        f"""
        SELECT id, event_type, title, description, latitude, longitude,
               address, occurred_at, source_url, category, severity
        FROM events WHERE {where}
        ORDER BY occurred_at DESC LIMIT ?
        """,
        tuple(params),
    )


# ── Status ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def api_status():
    """Dashboard health check with data counts."""
    counts = {}
    for table in ["events", "complaints_311", "calls_911", "hpd_violations",
                   "hpd_complaints", "news_articles", "legislation", "map_pins"]:
        result = await query(f"SELECT COUNT(*) as cnt FROM {table}")
        counts[table] = result[0]["cnt"] if result else 0

    return {
        "status": "running",
        "data_counts": counts,
    }


if __name__ == "__main__":
    import uvicorn
    print(f"\n  District 2 Intelligence Dashboard")
    print(f"  http://{HOST}:{PORT}\n")
    uvicorn.run(
        "app:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )
