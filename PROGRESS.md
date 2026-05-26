# Progress

## Module 1 — Property warehouse + buy-box rules ✅

**Status:** Complete — acceptance test passes.

### What runs end-to-end
- Drizzle schema: all 7 tables defined (`properties`, `property_status_history`, `owners`, `contacts`, `buy_boxes`, `lead_events`, `enrichment_jobs`)
- `propertyMatchesBuyBox(property, buyBox)` — pure function, reused by seed script and future Module 2 ingestor
- `deriveEligibility(status)` — maps Expired→contactable, Cancelled→watch_only, Withdrawn→held
- Seed script: 5,000 fake properties across 20 zip codes with realistic status distribution
- Acceptance test: 2 buy-boxes seeded, match run, idempotency verified, eligibility spot-checks pass
- Admin UI (Next.js 14 App Router): `/buy-boxes` list + `/buy-boxes/new` create form + `/buy-boxes/[id]` detail

### What's stubbed / not yet wired
- `packages/ingest` — placeholder (Module 2)
- `packages/enrich` — placeholder (Module 3)
- `inngest/` — placeholder (Module 3)
- Supabase Auth (magic-link) not yet enforced in the web app — no auth middleware yet
- `equity_pct` and `owner_occupied_flag` filtering in buy-box engine pass-through (null → skip, as designed — requires Module 3 enrichment)

### Next: Module 2 — Ingestion + status-change detection
- Inngest scheduled function polling MLS RESO Web API every 5 min
- Upsert into `properties`, append to `property_status_history`
- On delisting transition, evaluate buy-boxes and insert `lead_events`
- Idempotency: re-polling must not duplicate events
- MLS stand-in: `scripts/replay-delistings.ts` replays the seed stream at accelerated speed
