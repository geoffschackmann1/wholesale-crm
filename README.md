# wholesale-crm

Single-tenant rebuild of REsimpli for personal use, anchored on one wedge:

> A delisted listing inside my buy-box → alert on my phone within 10 minutes, with owner contact info already attached.

See [`PLAN.md`](./PLAN.md) for full spec.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 14 App Router, TypeScript strict |
| DB | Postgres on Supabase |
| ORM | Drizzle |
| Auth | Supabase Auth (magic link) |
| Jobs | Inngest |
| UI | Tailwind + shadcn/ui |
| Alerts | Twilio SMS-to-self + Web Push |
| Error tracking | Sentry |

## Monorepo layout

```
apps/web/          Next.js app
packages/db/       Drizzle schema + migrations + buy-box engine
packages/ingest/   MLS adapters (Module 2)
packages/enrich/   BatchData / RentCast adapters (Module 3)
scripts/           Seed + replay harness
inngest/           Background workflow definitions (Module 3+)
```

## Setup

```bash
# 1. Copy env
cp .env.example .env.local
# Fill in DATABASE_URL from your Supabase project → Settings → Database → Connection string (Transaction mode)

# 2. Install
pnpm install

# 3. Push schema to DB
pnpm db:generate
pnpm db:migrate

# 4. Seed 5,000 fake properties
pnpm seed

# 5. Run Module 1 acceptance test
pnpm test:m1

# 6. Start dev server
pnpm dev
```

## Module status

| Module | Status |
|---|---|
| 1 — Property warehouse + buy-box rules | ✅ Complete |
| 2 — Ingestion + status-change detection | 🔲 Pending |
| 3 — Enrichment + alerts | 🔲 Pending |
| 4 — Lead inbox + DFD PWA | 🔲 Pending |

See [`PROGRESS.md`](./PROGRESS.md) for details.
