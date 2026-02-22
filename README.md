# whatisms

Monorepo for all projects hosted on [whatisms.com](https://whatisms.com).

## Projects

### District 2 Dashboard (`district2-dashboard/`)

Real-time intelligence dashboard for NYC Council District 2 (Lower East Side, East Village, Greenwich Village). Tracks fire, crime, 311, HPD violations, and local news.

- **Stack**: Python FastAPI, SQLite, vanilla JS, Leaflet.js, Chart.js
- **URL**: [whatisms.com/district2](https://whatisms.com/district2)

### Personal Finance (`personal-finance/`)

Personal finance tracker with Plaid bank syncing, budgets, and spending insights.

- **Stack**: Next.js, Prisma, SQLite, Tailwind CSS
- **URL**: [whatisms.com/finance](https://whatisms.com/finance)

## Deployment

```bash
docker compose build && docker compose up -d
```

See each project's README for development setup.
