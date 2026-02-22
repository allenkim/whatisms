# CLAUDE.md

This is the `whatisms` monorepo — all projects hosted on whatisms.com.

## Repo Structure

```
whatisms/
├── district2-dashboard/   # NYC Council District 2 intelligence dashboard
├── personal-finance/      # Personal finance tracker (Next.js + Prisma)
├── docker-compose.yml     # Multi-service orchestration
├── Caddyfile              # Reverse proxy config (routes by path)
└── CLAUDE.md              # This file
```

## Projects

| Project | Stack | Path on Site | CLAUDE.md |
|---------|-------|-------------|-----------|
| District 2 Dashboard | Python FastAPI + vanilla JS | `/district2` | `district2-dashboard/CLAUDE.md` |
| Personal Finance | Next.js + Prisma + SQLite | `/finance` | `personal-finance/CLAUDE.md` |

## Deployment

All services are deployed on the same machine (whatisms.com) via Docker Compose. From the repo root:

```bash
docker compose build && docker compose up -d
```

- Caddy reverse proxy routes `/finance*` → `finance:3000`, everything else → `district2:8050`
- Each project has its own `Dockerfile` in its directory
- Persistent volumes use `name:` keys to preserve existing Docker data

## Auth

The district2-dashboard backend handles auth for the portal (session-based, httponly cookies). The portal at `/` shows tiles for all projects the user has access to. Admins see all projects automatically.
