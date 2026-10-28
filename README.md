# MediData — Enterprise Data Management (EDM) for Healthcare

A healthcare **Enterprise Data Management** platform built as an npm-workspaces monorepo.
It demonstrates the full data lifecycle: ingestion from siloled source systems (EMR, LIS,
Billing, Insurance, Legacy HL7), staging, ETL, data quality (DQ), master data management
(MDM / patient golden record), a dimensional warehouse, governance (catalog, glossary,
audit, lineage), analytics/KPIs, a hand-written ML risk model, REST + FHIR APIs, and a
Next.js web UI.

> **IMPORTANT — all data is SYNTHETIC.** Every patient, provider, claim, and lab result in
> this project is machine-generated fake data. No real PHI is stored or processed. This is
> a hard requirement because we use **Neon free tier, which has no BAA** — a BAA (Business
> Associate Agreement) is required before any real PHI may touch a cloud database. Never
> point this project at a real clinical database.

## Stack

- **Monorepo**: npm workspaces (Node >= 20), TypeScript strict, tsx for ESM runtime
- **Database**: PostgreSQL (Neon serverless) with Prisma — multi-schema
  (`app` OLTP, `staging` raw landing, `warehouse` dimensional, `gov` governance)
- **API**: Express 4 + Zod (+ zod-to-openapi), JWT (jose), CASL permissions, SSE, HL7 v2
- **Worker**: BullMQ + ioredis + node-cron — ETL, DQ, MDM, warehouse loads
- **Web**: Next.js 15 (App Router) + React 19 + TanStack Query/Table + Recharts + Tailwind
- **Optional local tooling**: `infra/docker-compose.yml` (Postgres 16, Redis 7, Metabase)

## Repository layout

```
frontend/           # Next.js standalone frontend (own package.json, file: deps on backend packages)
  app/              App Router pages
  components/       Reusable UI components
  lib/              Frontend helpers
  next.config.mjs   Next.js config (transpile @medidata/shared)
  package.json      Standalone deps (@medidata/db, @medidata/shared via file:)
  postcss.config.mjs, tailwind.config.ts, tsconfig.json

backend/            # Backend workspace root (owns apps/*, packages/*, fixtures/, infra/, tests/)
  apps/
    api/            REST + FHIR API server (Express)
    worker/         Background jobs: ETL, DQ, MDM, warehouse
  packages/
    shared/         Canonical types + zod schemas + API contract (ENDPOINTS)
    db/             Prisma schema (source of truth) + prisma client singleton + seed
    etl-core/       ETL primitives: extract/transform/load, parsers, checksums
    dq/             Data-quality rule engine
    mdm/            Master data management / patient matching
    analytics/      KPIs and warehouse aggregation
    ml/             Deterministic readmission / risk model
  fixtures/         Synthetic source-system extracts (EMR, LIS, billing, insurance, HL7)
  infra/            Optional docker-compose for local Postgres/Redis/Metabase
```

## Setup

1. **Node**: use Node >= 20 (`node -v`).
2. **Create a free Neon project** at <https://neon.tech>. Copy the pooled connection
   string (port 5432) and the direct (unpooled) string.
3. **Configure environment**:

   ```powershell
   Copy-Item .env.example .env
   # edit .env: set DATABASE_URL (POOLED string) and DIRECT_URL (direct string)
   ```

4. **Install** (installs all workspaces and runs `prisma generate`):

   ```powershell
   npm install
   ```

5. **Migrate** (applies the committed `0_init` migration):

   ```powershell
   npm run migrate:deploy
   ```

6. **Seed** synthetic data (users, patients, encounters, labs, claims, gov metadata,
   plus `fixtures/` source files):

   ```powershell
   npm run seed
   ```

7. **Run the apps** (three terminals):

   ```powershell
   npm run dev:api      # http://localhost:4000  (GET /health)
   npm run dev:worker   # background ETL/DQ/MDM jobs
   npm run dev:web      # http://localhost:3000
   ```

All seeded accounts use password `Passw0rd!123` (e.g. `admin@medidata.local`).

## Scripts

| Script                                  | What it does                                       |
| --------------------------------------- | -------------------------------------------------- |
| `npm run build`                         | Build/typecheck all workspaces                     |
| `npm run typecheck`                     | `tsc --noEmit` in every workspace                  |
| `npm test`                              | `vitest run` at the root                           |
| `npm run seed`                          | Seed synthetic data (`@medidata/db`)               |
| `npm run migrate:dev`                   | Prisma migrate dev (local DB)                      |
| `npm run migrate:deploy`                | Prisma migrate deploy (Neon / CI)                  |
| `npm run format`                        | Prettier write                                     |

Per-app dev: `npm run dev:api`, `npm run dev:worker`, `npm run dev:web`.

## Optional local infrastructure

`infra/docker-compose.yml` runs Postgres 16, Redis 7 and Metabase locally. This is
**optional** — Neon is the primary database and Upstash the primary Redis. Use compose
only when you want to develop offline.

```powershell
docker compose -f infra/docker-compose.yml up -d
```

## License / disclaimer

Educational project. Synthetic data only. Not for clinical use.
