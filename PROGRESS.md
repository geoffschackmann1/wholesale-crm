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
- `packages/ingest` — MlsAdapter interface defined; real RESO client deferred to broker onboarding
- `packages/enrich` — placeholder (Module 3)
- Supabase Auth (magic-link) not yet enforced in the web app — no auth middleware yet
- `equity_pct` / `owner_occupied_flag` buy-box filters pass-through when null (enrichment not run, as designed)

---

## Module 2 — Ingestion + status-change detection ✅

**Status:** Complete. Inngest function, replay harness, and acceptance test all in place.

### What runs end-to-end
- **`replay_queue` table** added to schema — MLS stand-in; each row is one status-change event with prev/new status snapshot
- **`inngest/functions/ingest-mls.ts`** — Inngest cron (`*/5 * * * *`) that:
  - Pulls up to 100 pending `replay_queue` entries ordered by `occurred_at`
  - Upserts `properties` by `mls_listing_id`; always appends to `property_status_history`
  - Detects delisting transitions (`newStatus ∈ {Expired,Withdrawn,Cancelled}` AND `prevStatus ≠ newStatus`)
  - Evaluates every active buy-box via `propertyMatchesBuyBox`; inserts matching `lead_events` with `onConflictDoNothing` (idempotent on unique index)
  - Handles Withdrawn→Active→Withdrawn re-delist: each distinct `occurred_at` creates a separate event
  - Marks queue entries processed
- **`scripts/replay-delistings.ts`** — seeds 110 queue entries (95 normal delistings + 5 re-delist chains), sorted by `occurred_at`; optional `--dry-run` flag; triggers Inngest dev server or prod after insert
- **`apps/web/app/replay/page.tsx`** — admin UI showing queue stats and last 20 processed events
- **`apps/web/app/api/inngest/route.ts`** — Next.js Inngest handler serving `ingestMls`
- **`scripts/run-acceptance-test-m2.ts`** — full acceptance test (no Inngest server required): populate queue → process → verify counts → idempotency → re-delist → eligibility spot-checks

### What's stubbed / not yet wired
- `packages/enrich` — placeholder (Module 3)
- Supabase Auth still unenforced
- `packages/ingest/MlsAdapter` — interface defined; real RESO client awaits broker onboarding

---

## Module 3 — Enrichment + alerts ✅

**Status:** Complete. Enrichment workflow, Twilio SMS, Web Push, and acceptance test all in place.

### What runs end-to-end
- **`packages/enrich/src/batchdata.ts`** — BatchData Property Lookup + Skip Trace adapter. Real API when `BATCHDATA_API_KEY` is set; deterministic mock (hash-based) otherwise so dev works without a live account.
- **`inngest/functions/enrich-and-alert.ts`** — `lead/created` Inngest workflow:
  1. Fetch lead + property
  2. 90-day cache check (skip BatchData if recently enriched)
  3. Property Lookup → upsert `owners`, update `properties.equity_pct` + `arv`, log cost to `enrichment_jobs`
  4. Skip Trace → insert `contacts` (up to 5 phones, 2 emails), log cost
  5. SMS-to-self via Twilio (primary channel) — logs to console in dev
  6. Web Push (best-effort, silent skip if VAPID keys unset)
- `held` (Withdrawn) leads: enrichment runs and contacts are stored, but SMS says "⚠️ Withdrawn — contact blocked"
- **`inngest/functions/ingest-mls.ts`** — fires `lead/created` event after each new `lead_event` insert
- **`apps/web/app/actions/leads.ts`** — `getRecentLeads()` server action (JOIN properties + owners)
- **`apps/web/app/page.tsx`** — dashboard "Recent alerts" section
- **`scripts/run-acceptance-test-m3.ts`** — synthetic Expired + Withdrawn leads, enrichment inline, verifies owners/contacts/enrichment_jobs, SMS message content, 90-day cache skip

### What's stubbed / not yet wired
- Web Push subscription not yet registered (Module 4 service worker)
- Supabase Auth still unenforced

---

## Module 4 — Lead inbox + DFD PWA ✅

**Status:** Complete. Full inbox, lead detail, DFD map shell, PWA manifest + service worker all in place.

### What runs end-to-end
- **`/inbox`** — lead_events newest-first with eligibility badges, owner name + top phone (if enriched). Dismiss / Snooze 7d / Save actions per card. `held` (Withdrawn) leads show compliance warning; all contact actions blocked.
- **`/inbox/[id]`** — full lead detail: property info grid, owner/mailing address, contacts list with `tel:` / `sms:` links (hidden for `held`), DNC status badge, map placeholder showing coordinates, Enrich Now button (fires `lead/created` Inngest event), Snooze / Dismiss / Save actions.
- **`/dfd`** — GPS `watchPosition` route tracking, nearby properties via bounding-box SQL query (color-coded green/gray by buy-box match), tap-to-save modal (BatchData inline + `watch_only` lead_event with `trigger_type='dfd'`), photo upload stub (Supabase Storage with 90-day retention TODO). MapLibre map is a placeholder pending tile-provider key.
- **PWA** — `manifest.json` (start_url `/inbox`, standalone), `sw.js` (install cache, network-first fetch, Web Push handler, notification click → open URL), `SwRegister` client component in layout.
- **Nav** — Inbox (with undismissed count badge), DFD, Buy Boxes, Replay.
- **`scripts/run-acceptance-test-m4.ts`** — 8 checks: inbox data, held eligibility, dismiss/snooze behavior, nearby properties bounding-box, DFD save → watch_only.

### What's stubbed / pending real configuration
- MapLibre map tiles — add `NEXT_PUBLIC_MAPTILER_KEY` (or any tile provider) and `pnpm add maplibre-gl`
- Supabase Storage photo bucket lifecycle policy — set 90-day auto-purge in Supabase dashboard
- Supabase Auth middleware — magic-link gating not yet enforced on routes
- VAPID keys + push subscription — generate with `npx web-push generate-vapid-keys`, set env vars, register subscription from DFD page

---

## MVP Status

All 4 modules complete. Zero TypeScript errors. Ready for:
1. Supabase project + `pnpm db:migrate`
2. `pnpm seed` → `pnpm test:m1`
3. BatchData + Twilio credentials → `pnpm test:m3`
4. Deploy to Vercel + configure env vars
5. Install PWA on phone, confirm SMS-to-self alert end-to-end
