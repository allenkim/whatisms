# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal finance tracker built with Next.js 16 (App Router), Prisma with LibSQL/SQLite, and Plaid for bank account syncing. Single-user, local-only app with no authentication.

## Commands

```bash
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint (v9 flat config)

# Database
npx prisma migrate dev              # Apply migrations / create new migration
npx prisma migrate dev --name <name> # Create named migration
npx prisma generate                  # Regenerate Prisma client after schema changes
npx prisma studio                    # Visual database browser
```

Prisma client is generated to `src/generated/prisma/` (not `node_modules`). After any `schema.prisma` change, run both `prisma migrate dev` and `prisma generate`.

## Architecture

**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind v4 + Prisma 7 + LibSQL (SQLite) + Plaid API + Recharts

**Data flow:** UI (Server/Client Components) → API Routes (`src/app/api/`) → Prisma ORM → SQLite (`prisma/dev.db`)

### Key directories

- `src/app/` — Next.js App Router pages and API routes
- `src/app/api/` — REST API endpoints (plaid/, accounts/, holdings/, transactions/, snapshots/, budgets/, bills/, credit-score/, insights/)
- `src/components/` — Shared React components
- `src/lib/` — Utilities: `db.ts` (Prisma singleton), `plaid.ts` (Plaid client), `categories.ts` (category definitions)
- `prisma/schema.prisma` — Database schema (11 models)

### Patterns

- **Server Components** fetch data directly via Prisma (pages like dashboard, spending, budgets)
- **Client Components** (`"use client"`) handle interactivity (forms, charts, Plaid Link)
- Pages that need fresh data use `export const dynamic = "force-dynamic"`
- DB singleton in `src/lib/db.ts` — import as `import { prisma } from "@/lib/db"`
- Plaid integration: create link token → user connects via Plaid Link → exchange for access token → sync holdings/transactions

### Database

SQLite via LibSQL adapter. DB file at `prisma/dev.db`. Key models: PlaidItem, Account, Holding, Transaction, Snapshot, BudgetGoal, Bill, CreditScore, CostBasis, Insight.

Transaction amounts: positive = money out, negative = money in (Plaid convention).

## Docker

- **Must use `node:22-slim` (Debian), NOT `node:22-alpine`** — The `@libsql` native module requires glibc. Alpine uses musl libc, which causes `fcntl64: symbol not found` at build time during Next.js page data collection.
- **Must install OpenSSL** — Prisma requires libssl in `node:22-slim`. Add `apt-get update -y && apt-get install -y openssl` before `npm ci`.
- `DATABASE_URL` is set via `docker-compose.yml` to `file:/app/data/finance.db` (persistent volume). `db.ts` falls back to `file:prisma/dev.db` for local dev.
- `prisma migrate deploy` runs on every container startup (idempotent).

## Environment

Copy `env.example` to `.env` and fill in Plaid credentials from https://dashboard.plaid.com/developers/keys. Use `PLAID_ENV=sandbox` for testing with fake data.
