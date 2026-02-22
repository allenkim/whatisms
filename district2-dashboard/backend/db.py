import aiosqlite
import os

import bcrypt

from config import DB_PATH, DATA_DIR

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,        -- 'fire', 'crime', '311', 'news', 'alert', 'dob'
    title TEXT NOT NULL,
    description TEXT,
    latitude REAL,
    longitude REAL,
    address TEXT,
    occurred_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    source_url TEXT,
    raw_data TEXT,                    -- JSON blob of full record
    category TEXT,                   -- subcategory (e.g., 'FELONY', 'Noise', 'Structural Fire')
    severity TEXT                     -- 'low', 'medium', 'high', 'critical'
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_type_occurred ON events(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS complaints_311 (
    unique_key TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    closed_date TEXT,
    agency TEXT,
    complaint_type TEXT,
    descriptor TEXT,
    location_type TEXT,
    incident_zip TEXT,
    address TEXT,
    city TEXT,
    status TEXT,
    resolution_description TEXT,
    latitude REAL,
    longitude REAL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_311_created ON complaints_311(created_date);
CREATE INDEX IF NOT EXISTS idx_311_type ON complaints_311(complaint_type);
CREATE INDEX IF NOT EXISTS idx_311_type_created ON complaints_311(complaint_type, created_date);

CREATE TABLE IF NOT EXISTS calls_911 (
    id TEXT PRIMARY KEY,
    incident_date TEXT,
    incident_time TEXT,
    call_type TEXT,
    borough TEXT,
    precinct TEXT,
    latitude REAL,
    longitude REAL,
    dispatch_ts TEXT,
    arrival_ts TEXT,
    closing_ts TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_911_date ON calls_911(incident_date);
CREATE INDEX IF NOT EXISTS idx_911_type ON calls_911(call_type);

CREATE TABLE IF NOT EXISTS hpd_violations (
    violation_id TEXT PRIMARY KEY,
    building_id TEXT,
    registration_id TEXT,
    borough TEXT,
    house_number TEXT,
    street_name TEXT,
    zip TEXT,
    apartment TEXT,
    story TEXT,
    block TEXT,
    lot TEXT,
    class TEXT,                      -- A, B, C, I
    inspection_date TEXT,
    approved_date TEXT,
    nov_description TEXT,
    nov_issued_date TEXT,
    current_status TEXT,
    current_status_date TEXT,
    latitude REAL,
    longitude REAL,
    owner_name TEXT,                 -- resolved from registration contacts
    owner_type TEXT,                 -- 'CorporateOwner', 'IndividualOwner'
    head_officer TEXT,
    officer TEXT,
    managing_agent TEXT,
    corporation_name TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_hpd_v_class ON hpd_violations(class);
CREATE INDEX IF NOT EXISTS idx_hpd_v_status ON hpd_violations(current_status);
CREATE INDEX IF NOT EXISTS idx_hpd_v_owner ON hpd_violations(owner_name);
CREATE INDEX IF NOT EXISTS idx_hpd_v_building ON hpd_violations(building_id);
CREATE INDEX IF NOT EXISTS idx_hpd_v_inspection ON hpd_violations(inspection_date);

CREATE TABLE IF NOT EXISTS hpd_complaints (
    complaint_id TEXT,
    problem_id TEXT PRIMARY KEY,
    building_id TEXT,
    borough TEXT,
    house_number TEXT,
    street_name TEXT,
    zip TEXT,
    major_category TEXT,
    minor_category TEXT,
    complaint_status TEXT,
    complaint_status_date TEXT,
    problem_status TEXT,
    problem_status_date TEXT,
    status_description TEXT,
    latitude REAL,
    longitude REAL,
    received_date TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_hpd_c_received ON hpd_complaints(received_date);
CREATE INDEX IF NOT EXISTS idx_hpd_c_major ON hpd_complaints(major_category);

CREATE TABLE IF NOT EXISTS news_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT,
    source TEXT,
    published_at TEXT,
    feed_name TEXT,                   -- which feed it came from
    is_epstein_related INTEGER DEFAULT 0,
    is_district_news INTEGER DEFAULT 0,
    is_hyperlocal INTEGER DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at);
CREATE INDEX IF NOT EXISTS idx_news_epstein ON news_articles(is_epstein_related);
CREATE INDEX IF NOT EXISTS idx_news_hyperlocal ON news_articles(is_hyperlocal);

CREATE TABLE IF NOT EXISTS legislation (
    id TEXT PRIMARY KEY,
    file_number TEXT,
    name TEXT,
    title TEXT,
    type TEXT,
    status TEXT,
    intro_date TEXT,
    agenda_date TEXT,
    passed_date TEXT,
    enactment_date TEXT,
    url TEXT,
    sponsors TEXT,                    -- JSON array of sponsor names
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leg_intro ON legislation(intro_date);

CREATE TABLE IF NOT EXISTS aggregations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_source TEXT NOT NULL,        -- '311', '911', 'hpd_violations', 'hpd_complaints'
    period_type TEXT NOT NULL,        -- 'daily', 'weekly', 'monthly'
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    category TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    extra_data TEXT,                  -- JSON blob for additional breakdown
    UNIQUE(data_source, period_type, period_start, category)
);

CREATE INDEX IF NOT EXISTS idx_agg_source_period ON aggregations(data_source, period_type, period_start);

CREATE TABLE IF NOT EXISTS map_pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    address TEXT,
    description TEXT,
    tag TEXT DEFAULT 'General',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pin_tags (
    name TEXT PRIMARY KEY,
    icon TEXT,
    color TEXT,
    is_custom INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    path TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_projects (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, project_id)
);
"""


async def get_db() -> aiosqlite.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    db = await get_db()
    try:
        await db.executescript(SCHEMA)
        # Migrate: add new HPD contact columns if missing
        cursor = await db.execute("PRAGMA table_info(hpd_violations)")
        existing_cols = {row[1] for row in await cursor.fetchall()}
        for col in ("head_officer", "officer", "managing_agent", "corporation_name"):
            if col not in existing_cols:
                await db.execute(f"ALTER TABLE hpd_violations ADD COLUMN {col} TEXT")
        # Seed default pin tags
        default_tags = [
            ("Issue", "circle-exclamation", "#f74f4f", 0),
            ("Meeting", "calendar", "#4f8ff7", 0),
            ("Constituent", "user", "#4ff77a", 0),
            ("Development", "building", "#f7a94f", 0),
            ("Safety", "shield", "#f74fa9", 0),
            ("General", "map-pin", "#9f4ff7", 0),
        ]
        for name, icon, color, is_custom in default_tags:
            await db.execute(
                "INSERT OR IGNORE INTO pin_tags (name, icon, color, is_custom) VALUES (?, ?, ?, ?)",
                (name, icon, color, is_custom),
            )
        # Seed admin user (allen / allen1729)
        existing = await db.execute("SELECT id FROM users WHERE username = 'allen'")
        if not await existing.fetchone():
            pw_hash = bcrypt.hashpw(b"allen1729", bcrypt.gensalt()).decode()
            await db.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                ("allen", pw_hash, "admin"),
            )
        # Seed default project
        existing = await db.execute("SELECT id FROM projects WHERE slug = 'district2'")
        if not await existing.fetchone():
            await db.execute(
                "INSERT INTO projects (slug, name, description, path) VALUES (?, ?, ?, ?)",
                ("district2", "NYC Council District 2", "Real-time intelligence dashboard for the Lower East Side, East Village, Greenwich Village, and surrounding neighborhoods.", "/district2"),
            )
        await db.commit()
    finally:
        await db.close()


async def upsert_many(table: str, rows: list[dict], conflict_column: str = "id"):
    if not rows:
        return 0
    db = await get_db()
    try:
        cols = list(rows[0].keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        update_cols = ", ".join(
            f"{c} = excluded.{c}" for c in cols if c != conflict_column
        )
        sql = (
            f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) "
            f"ON CONFLICT({conflict_column}) DO UPDATE SET {update_cols}"
        )
        await db.executemany(sql, [tuple(r[c] for c in cols) for r in rows])
        await db.commit()
        return len(rows)
    finally:
        await db.close()


async def query(sql: str, params: tuple = ()) -> list[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def execute(sql: str, params: tuple = ()):
    db = await get_db()
    try:
        await db.execute(sql, params)
        await db.commit()
    finally:
        await db.close()
