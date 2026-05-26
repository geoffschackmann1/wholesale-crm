# Wholesale CRM — Ultra-Plan

> Single-tenant rebuild of resimpli.com for personal use, **anchored on one wedge**:
> a withdrawn listing inside my buy-box → push alert on my phone within 10 minutes,
> with owner contact info already attached.

**Repo:** `geoffschackmann1/wholesale-crm` (private)
**Audience:** me (solo wholesaler), maybe SaaS later
**Status:** spec — no code yet

---

## TL;DR

- MVP = **4 modules**, not 12. Ship in ~6 weeks of focused work.
- Core wedge = **real-time delisting alerts**, not a CRM clone.
- Stack is locked (Next.js + Supabase + Inngest + Twilio + BatchData).
- Long-pole external clocks (A2P 10DLC, Gmail OAuth, BatchData onboarding) kick off **Day 1, in parallel** with code.
- Compliance gates (TCPA, A2P, DNC, CAN-SPAM) are blockers — not nice-to-haves.
- Everything else from REsimpli (dialer, drip, mail, CRM, accounting, AI agents) is **Phase 2**.

---

## 1. The wedge — one sentence

> "When a house in *my buy-box* gets *withdrawn or expired* from the MLS, I get a push notification within **10 minutes** with the owner's name, mailing address, and best phone number — and one tap puts it in my pipeline."

If a feature doesn't serve that sentence, it's Phase 2.

---

## 2. Hard scope

### In
- MLS ingestion (one market) + status-change detection (focus on `Withdrawn`, `Expired`, `Cancelled`).
- Buy-box rules engine (geography, price, beds, property type, equity threshold).
- BatchData enrichment (owner, mailing address, phones, equity).
- Push alerts to my phone (mobile push + SMS fallback).
- Lead inbox + dismiss/keep/contact action.
- DFD PWA (because driving routes feed the same pipeline).

### Out (Phase 2 — DO NOT BUILD IN MVP)
Kanban CRM • dialer • SMS broadcast • email drip • direct mail • cash-buyer DB • e-sign • accounting • seller landing sites • AI agents • multi-market • multi-tenant.

### Never (only matters at SaaS scale)
Billing • RBAC • orgs • SSO • white-label • support tooling • integrations marketplace.

---

## 3. Pre-answered assumptions (so the build agent stops asking)

| Decision | Locked answer | Why |
|---|---|---|
| Target market | **TBD — I'll name it before code starts.** Default: home market with willing broker. | MLS access is per-market. |
| Single user | Yes. Auth = Supabase magic link, my email only. | No SaaS chrome. |
| Hosting | **Vercel** for app, **Supabase** for db+auth, **Inngest Cloud** for jobs. | All have generous free tiers. |
| Mobile | **PWA installed to home screen**. Native only if push notifications underperform. | Ship faster, one codebase. |
| Test data | Seed script: 5,000 fake properties + 100 simulated "Withdrawn" events spread over 30 days. | Don't wait on real MLS to start. |
| Code style | TypeScript strict, Drizzle, Tailwind + shadcn/ui, server actions over REST where possible. | Convention beats deliberation. |
| Error handling | Sentry from day 1 (free tier). | One install. |
| Secrets | `.env.local` in dev, Vercel env vars in prod, never committed. | Standard. |

---

## 4. Stack (locked — no debate)

| Layer | Choice |
|---|---|
| App framework | Next.js 14 App Router, TypeScript strict |
| DB | Postgres on Supabase |
| ORM | Drizzle |
| Auth | Supabase Auth (magic link, single allowed email) |
| Background jobs | Inngest |
| UI | Tailwind + shadcn/ui |
| Maps (DFD) | MapLibre + OpenStreetMap tiles (free) |
| Push notifications | Web Push API (PWA) + Twilio SMS fallback |
| Error tracking | Sentry |
| Hosting | Vercel + Supabase + Inngest Cloud |

### Third-party data + comms (sign up Day 1)
- **BatchData** — owner/equity/skip-trace API
- **Twilio** — one provisioned number for SMS alerts (voice deferred to Phase 2)
- **MLS access** — broker-partnership in target market, **RESO Web API** preferred over RETS

### Deferred to Phase 2
PostGrid, Gmail OAuth, Lob, Plaid, Slybroadcast, DocuSign, Twilio Voice JS SDK, Stripe.

---

## 5. The 4-module MVP

Build strictly in order. Each module ends with a measurable acceptance test. No moving on until prior one passes.

### Module 1 — Property warehouse + buy-box rules (Week 1–2)

**What:** Postgres schema + buy-box rule engine + admin UI to define rules.

**Schema** (Drizzle):
- `properties` (address normalized, lat/lng, beds/baths/sqft, year_built, current_list_price, current_status, last_status_change_at)
- `property_status_history` (property_id, status, source, occurred_at)
- `owners` (name, mailing_address, owner_occupied_flag, ownership_length_yrs)
- `contacts` (owner_id, kind ∈ {phone, email}, value, confidence_score)
- `buy_boxes` (name, criteria_json — county, zip set, price min/max, beds min, sqft min, equity_pct_min, occupancy_flag, exclusion_list)
- `lead_events` (property_id, buy_box_id, trigger_type, occurred_at, dismissed_at)
- `enrichment_jobs` (property_id, provider, status, response_json, cost_cents)

**Buy-box rule engine:** declarative JSON criteria evaluated as a SQL filter at query time AND on each incoming status-change event. Single function — `propertyMatchesBuyBox(property, buyBox) → boolean` — reused everywhere.

**Acceptance test:** Seed 5,000 fake properties. Define 2 buy-boxes. Run match. Output count matches hand-counted SQL answer.

### Module 2 — Ingestion + status-change detection (Week 2–3)

**What:** Pull MLS data, detect status transitions to `Withdrawn` / `Expired` / `Cancelled`, fire `lead_events`.

- Inngest scheduled function polls MLS RESO Web API every **5 minutes** (or webhook subscription if broker supports it).
- Upsert into `properties`, append to `property_status_history` on any change.
- On transition into a "delisted" status, evaluate every active buy-box. For each match, insert `lead_events` row.
- Idempotent: re-polling the same data must not produce duplicate events.
- Until live MLS access is online, use **a seed script** that replays a 30-day "Withdrawn" stream of fake events at accelerated speed — proves the alerting pipeline.

**Acceptance test:** Replay seed-stream → exactly 100 `lead_events` rows created → re-run with no duplicates → handle a property that transitions Withdrawn → Active → Withdrawn correctly.

### Module 3 — Enrichment + alerts (Week 3–4)

**What:** On every new `lead_event`, enrich the property + push an alert.

- Inngest `lead.created` workflow:
  1. Call BatchData "Property Lookup" → owner, equity, mailing address.
  2. Call BatchData "Skip Trace" → up to 5 phones, 2 emails, ranked by confidence.
  3. Write to `owners` + `contacts`.
  4. Build alert payload: address, owner name, top phone, "Was listed at $X for Y days. Withdrawn just now."
  5. Send Web Push (registered PWA on my phone).
  6. SMS fallback via Twilio if no push delivery within 60s.
- Cache: never re-trace an owner within 90 days. Log per-call cost to `enrichment_jobs.cost_cents`.

**Acceptance test:** Synthetic `lead_event` fires → push lands on my phone within **<10 minutes** including BatchData latency → enrichment data visible in app → cost row written.

### Module 4 — Lead inbox + DFD PWA shell (Week 4–6)

**What:** The phone-facing app.

- `/inbox` — list of `lead_events` newest first, swipe-to-dismiss, tap-to-open.
- Lead detail page — property info, owner contact (call/text buttons that open native dialer/SMS — **no in-app dialer**), map view, "snooze 7 days" / "discard" / "saved" actions.
- `/dfd` — map showing my current location + nearby properties (color-coded by buy-box match). Tap location → reverse geocode → "save to inbox" with on-demand BatchData lookup. Track route. Photo upload to Supabase Storage.
- PWA manifest + service worker for installability + Web Push.

**Acceptance test:** Open PWA on my phone → see 3 seeded alerts in inbox → drive around the block → DFD shows my path and 2 properties along the way → tap one → BatchData lookup runs → owner appears.

---

## 6. Phase 2 (after MVP runs in production for 2 weeks)

In rough order of value:
1. **Twilio Voice click-to-call** (in-browser dialer using Voice JS SDK)
2. **SMS one-way broadcast** to opted-in contacts (requires A2P 10DLC complete)
3. **Drip sequences** via Inngest workflows
4. **Direct mail via PostGrid** (postcards for "missed" leads)
5. **Pipeline / Kanban CRM**
6. **Cash-buyer DB + match-blast on contract**
7. **Multi-market expansion** (add MLS feeds in 2nd, 3rd market)
8. **Gmail OAuth + email sequences**
9. **AI auto-responder** (SMS reply bot — surprisingly high leverage)
10. **Pre-foreclosure / tax-delinquent / probate list ingestion** (county records)
11. **Plaid accounting + e-sign + seller landing pages**

---

## 7. Compliance gates (BLOCKERS — cannot ship MVP without)

| Requirement | What it is | Lead time | Day-1 action |
|---|---|---|---|
| **A2P 10DLC** | US carrier-mandated SMS registration. Without it, Twilio SMS is throttled/blocked. | **4–12 weeks** | Register Brand + Campaign via Twilio Console |
| **TCPA written consent** | Required before any SMS or call to a cell. | Process, not time | Build opt-in flow before any SMS feature ships |
| **DNC scrubbing** | Scrub against federal + state DNC before SMS/call. | Account setup | Vendor: free.dnc.gov (registration) or DNC.com (paid API) |
| **CAN-SPAM (when email lands)** | Physical address + unsubscribe in every email. | None | Bake into email templates |
| **MLS data-use agreement** | Broker-signed agreement defining what I can do with the feed (e.g. no public display, no resale). | 2–8 weeks | Identify broker partner Week 1 |
| **State wholesaling rules** | Some states require licensure / specific assignment-contract disclosures (TX, IL, OK, others). | Process | One-pager checklist for my state — get attorney review |

**Strict rule for MVP:** Push + SMS alerts go to **me only** — that's a personal notification, no third-party SMS. A2P + TCPA do not block MVP **if and only if** SMS is restricted to my own number. The moment I send a text to a seller, A2P must be complete.

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | BatchData declines a solo-dev account | Medium | High | Fallback: **RentCast API** (cheap, public records) + **PropMix** + manual entry for owner lookups. Test all three Week 1. |
| R2 | MLS broker partnership drags 6+ weeks | High | High | Start with **3 brokers in parallel** Week 1. Meanwhile, simulate with seed data. |
| R3 | A2P 10DLC denied / takes 12 weeks | Medium | Medium | MVP doesn't depend on SMS-to-third-parties. Self-SMS only until A2P clears. |
| R4 | Real-time delisting isn't actually a real moat (PropStream already has "Failed Listings") | High | High | Wedge isn't the *feature* — it's the **<10 min latency + auto-enrichment + my buy-box**. If PropStream's nightly batch already wins, kill the project, save the money. |
| R5 | Web Push reliability on iOS | Medium | Low | SMS fallback to my own number is the safety net. iOS 16.4+ supports PWA push — confirm device. |
| R6 | Withdrawn ≠ Motivated (some withdraw to relist next season) | High | Medium | Filter: only "Withdrawn after >60 days on market + ≥1 price drop." Tune in Module 1's buy-box rules. |
| R7 | Owner contact info wrong / 50% bad phone rate | High | Medium | Multi-source: BatchData primary, REIPro/Whitepages secondary. Track per-source accuracy in `contacts.confidence_score`. |
| R8 | Solo build burns out at Module 3 | Medium | High | Force a working alert into my pocket by end of Week 4. The dopamine carries Module 4. |

---

## 9. Cost model (monthly, run-rate)

| Volume | MLS | BatchData enrichment | Twilio (SMS to self) | Supabase | Vercel | Inngest | **Total** |
|---|---|---|---|---|---|---|---|
| 1k props tracked, 30 alerts/mo | $500–2k/yr ≈ $80/mo | ~30 lookups × $0.15 = $5 | $1.15 number + ~$0.20 SMS | Free tier | Free tier | Free tier | **~$90/mo** |
| 10k props, 300 alerts/mo | $80 | ~300 × $0.15 = $45 | $1.50 | Free tier | Free tier | Free tier | **~$130/mo** |
| 50k props, 1,500 alerts/mo | $80 | ~1,500 × $0.15 = $225 | $5 | $25 (Pro) | $20 (Pro) | $20 (Starter) | **~$380/mo** |

*Compared to REsimpli at $149–599/mo + add-ons, breakeven is at the lowest volume tier almost immediately.* Real expense is the **one-time MLS broker setup** + my time.

---

## 10. Day-1 long-pole work (start before code)

1. **Identify target market** + **shortlist 3 brokers** for MLS partnership. Email all 3 today.
2. **Sign up BatchData**, **RentCast**, **PropMix** dev/sandbox accounts. First one to approve wins; the others are fallback.
3. **Provision Twilio account** + buy one local number in target market area code.
4. **Start A2P 10DLC Brand registration** (4–12 wk clock). Even if MVP doesn't need it, Phase 2 does.
5. **Create Supabase project**, **Vercel project**, **Inngest workspace**.
6. **Set up `geoffschackmann1/wholesale-crm` repo** with this PLAN.md, ASSUMPTIONS.md, COMPLIANCE.md, RISKS.md, COSTS.md as separate files for easier review.
7. **Apple Developer account ($99/yr)** only if iOS Web Push proves unreliable in testing.

---

## 11. Repo layout (target)

```
wholesale-crm/
├─ README.md                # repo overview, status, links
├─ PLAN.md                  # this file
├─ ASSUMPTIONS.md           # locked decisions
├─ COMPLIANCE.md            # TCPA, A2P, DNC, CAN-SPAM checklists
├─ RISKS.md                 # risk register
├─ COSTS.md                 # cost model + actuals (updated monthly)
├─ PROGRESS.md              # updated by build agent after each module
├─ .env.example             # all required env vars, no values
├─ apps/
│  └─ web/                  # Next.js app
├─ packages/
│  ├─ db/                   # Drizzle schema + migrations
│  ├─ ingest/               # MLS adapters + status detection
│  └─ enrich/               # BatchData / RentCast adapters
├─ scripts/
│  ├─ seed-properties.ts
│  └─ replay-withdrawals.ts
└─ inngest/                 # background workflow definitions
```

---

## 12. Build-agent operating instructions (paste into Claude Code session for the build)

```
Repo: github.com/geoffschackmann1/wholesale-crm
Read PLAN.md, ASSUMPTIONS.md, COMPLIANCE.md, RISKS.md, COSTS.md before writing code.

Rules:
1. Build strictly Modules 1 → 4 in PLAN.md order. Do not start a module until prior module's acceptance test passes.
2. Locked decisions in ASSUMPTIONS.md are non-negotiable unless you explain WHY in a PR and I approve.
3. Compliance items in COMPLIANCE.md are blockers — do not ship a feature that violates them.
4. Use real APIs in dev (with low volumes) against my sandbox accounts. No mocks.
5. After each module, update PROGRESS.md (5–10 lines: what runs end-to-end, what's stubbed, next).
6. If the spec is ambiguous or your work hits a wall, STOP and ask. Don't expand scope without permission.
7. Every commit message ends with a "Verified" line listing which acceptance test(s) it passes.
```

---

## What this plan deliberately doesn't have

- A dialer (Phase 2 — `tel:` link works fine for v1)
- A Kanban (Phase 2 — the inbox + snooze/keep/discard is the v1 pipeline)
- Email (Phase 2 — Gmail OAuth has weeks of verification clock)
- Drip sequences (Phase 2 — there's nobody to drip to until I have permission flows)
- A nationwide footprint (one market validates the wedge or it doesn't)
- A SaaS skin (single-tenant means I'm the user; productization is a separate fork later)

---

## Definition of "MVP done"

1. A real Withdrawn event in my target MLS → push notification on my phone → owner + phone visible → tap-to-call works. **End-to-end latency < 10 minutes.**
2. Buy-box rules let me filter to <50 alerts/month in a busy metro.
3. DFD route logs my drives; PWA installs on iOS and Android.
4. Monthly run-rate ≤ $150 at current volume.
5. I've called 5 sellers from leads the system surfaced.
