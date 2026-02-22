"""Authentication, session management, and user/project access control."""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt

from db import query, execute, get_db


# ── Password helpers ─────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Session management ───────────────────────────────────────────────────────

async def create_session(user_id: int, remember: bool = False) -> str:
    token = secrets.token_hex(32)
    days = 30 if remember else 7
    expires = datetime.now(timezone.utc) + timedelta(days=days)
    await execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires.strftime("%Y-%m-%d %H:%M:%S")),
    )
    return token


async def validate_session(token: str) -> dict | None:
    rows = await query(
        """SELECT u.id, u.username, u.role, s.expires_at
           FROM sessions s JOIN users u ON s.user_id = u.id
           WHERE s.token = ?""",
        (token,),
    )
    if not rows:
        return None
    row = rows[0]
    if datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S") < datetime.now(timezone.utc):
        await delete_session(token)
        return None
    return {"id": row["id"], "username": row["username"], "role": row["role"]}


async def delete_session(token: str):
    await execute("DELETE FROM sessions WHERE token = ?", (token,))


async def cleanup_expired_sessions():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    await execute("DELETE FROM sessions WHERE expires_at < ?", (now,))


# ── User authentication ─────────────────────────────────────────────────────

async def authenticate_user(username: str, password: str) -> dict | None:
    rows = await query(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?",
        (username,),
    )
    if not rows:
        return None
    user = rows[0]
    if not verify_password(password, user["password_hash"]):
        return None
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


# ── User management ─────────────────────────────────────────────────────────

async def list_users() -> list[dict]:
    users = await query(
        "SELECT id, username, role, created_at FROM users ORDER BY id"
    )
    for u in users:
        proj_rows = await query(
            "SELECT project_id FROM user_projects WHERE user_id = ?", (u["id"],)
        )
        u["project_ids"] = [r["project_id"] for r in proj_rows]
    return users


async def create_user(username: str, password: str, role: str = "user", project_ids: list[int] | None = None) -> dict:
    pw_hash = hash_password(password)
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, pw_hash, role),
        )
        cursor = await db.execute("SELECT last_insert_rowid()")
        row = await cursor.fetchone()
        user_id = row[0]
        if project_ids:
            for pid in project_ids:
                await db.execute(
                    "INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)",
                    (user_id, pid),
                )
        await db.commit()
        return {"id": user_id, "username": username, "role": role, "project_ids": project_ids or []}
    finally:
        await db.close()


async def delete_user(user_id: int) -> bool:
    admins = await query("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'")
    user = await query("SELECT role FROM users WHERE id = ?", (user_id,))
    if user and user[0]["role"] == "admin" and admins[0]["cnt"] <= 1:
        return False
    await execute("DELETE FROM users WHERE id = ?", (user_id,))
    return True


async def change_password(user_id: int, old_password: str, new_password: str) -> bool:
    rows = await query("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    if not rows:
        return False
    if not verify_password(old_password, rows[0]["password_hash"]):
        return False
    pw_hash = hash_password(new_password)
    await execute("UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, user_id))
    return True


# ── Project access ───────────────────────────────────────────────────────────

async def get_user_projects(user_id: int, role: str) -> list[dict]:
    if role == "admin":
        return await query("SELECT * FROM projects WHERE is_active = 1 ORDER BY name")
    return await query(
        """SELECT p.* FROM projects p
           JOIN user_projects up ON p.id = up.project_id
           WHERE up.user_id = ? AND p.is_active = 1
           ORDER BY p.name""",
        (user_id,),
    )


async def user_has_project_access(user_id: int, role: str, project_slug: str) -> bool:
    if role == "admin":
        return True
    rows = await query(
        """SELECT 1 FROM user_projects up
           JOIN projects p ON p.id = up.project_id
           WHERE up.user_id = ? AND p.slug = ?""",
        (user_id, project_slug),
    )
    return len(rows) > 0


async def list_projects() -> list[dict]:
    return await query("SELECT * FROM projects ORDER BY name")


async def set_user_projects(user_id: int, project_ids: list[int]):
    db = await get_db()
    try:
        await db.execute("DELETE FROM user_projects WHERE user_id = ?", (user_id,))
        for pid in project_ids:
            await db.execute(
                "INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)",
                (user_id, pid),
            )
        await db.commit()
    finally:
        await db.close()
