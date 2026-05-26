# Wholesale CRM — Ultra-Plan

> Single-tenant rebuild of resimpli.com for personal use, **anchored on one wedge**:
> a delisted listing inside my buy-box → alert on my phone within 10 minutes,
> with owner contact info already attached. (Expired = contactable; Withdrawn = alert-only.)

**Repo:** `geoffschackmann1/wholesale-crm` (private)
**Audience:** me (solo wholesaler), maybe SaaS later
**Status:** spec — no code yet

---

## TL;DR

- MVP = **4 modules**, not 12. Ship in ~6 weeks of focused work.
- Core wedge = **real-time delisting alerts**, not a CRM clone — **Expired is the auto-contactable trigger; Withdrawn is alert-only (still under a listing agreement)**.
- Stack is locked (Next.js + Supabase + Inngest + Twilio + BatchData).
- Long-pole external clocks (A2P 10DLC, Gmail OAuth, BatchData onboarding) kick off **Day 1, in parallel** with code.
- **Resolve before code — two potential project-killers:** (S2/R2) whether any broker can grant a feed that includes off-market statuses *and* permits owner outreach, and (R1) whether BatchData's real-time API is pay-as-you-go or has a $2k/mo floor.
- Compliance gates (MLS data-use, real-estate solicitation, TCPA/PEWC, DNC+RND, A2P, state wholesaling licensure, CAN-SPAM) are blockers — not nice-to-haves.
- Everything else from REsimpli (dialer, drip, mail, CRM, accounting, AI agents) is **Phase 2**.

---

## 1. The wedge — one sentence

> "When a house in *my buy-box* gets *delisted* from the MLS, I get a push notification within **10 minutes** with the owner's name, mailing address, and best phone number — and one tap puts it in my pipeline."

**The three delisting statuses are NOT legally equal — the wedge treats them differently:**
- **Expired** = listing agreement lapsed. Owner is cleanly contactable (subject to DNC/TCPA). **This is the primary, auto-contactable trigger.**
- **Cancelled** = ambiguous; often relisted or still represented. Surfaced as *watch-only* until I manually confirm it's not relisted.
- **Withdrawn / Temporarily-Off-Market** = **seller is STILL under a listing agreement**. Contacting the owner risks tortious interference + MLS/state-real-estate-commission violations. Surfaced as *held* with a `do_not_contact_until_confirmed_expired` flag — alert me, but block contact actions until the listing actually expires.

If a feature doesn't serve that sentence, it's Phase 2.

---

## 2. Hard scope

### In
- MLS ingestion (one market) + status-change detection (focus on `Withdrawn`, `Expired`, `Cancelled`).
- Buy-box rules engine (geography, price, beds, property type, equity threshold).
- BatchData enrichment (owner, mailing address, phones, equity).
- Alerts to my phone (SMS-to-self primary + Web Push enhancement — see R11).
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
| Target market | **TBD — I'll name it before code starts**, and the choice must clear two gates first: (1) the state permits unlicensed wholesaling at my cadence (R10), (2) a broker there can grant an off-market + outreach-permitted feed (S2/R2). Default: home market with willing broker. | MLS access — and the *legality of the business* — is per-market. |
| Single user | Yes. Auth = Supabase magic link, my email only. | No SaaS chrome. |
| Hosting | **Vercel** for app, **Supabase** for db+auth, **Inngest Cloud** for jobs. | All have generous free tiers. |
| Mobile | **PWA installed to home screen**. Native only if push notifications underperform. | Ship faster, one codebase. |
| Test data | Seed script: 5,000 fake properties + 100 simulated delisting events (mix of Expired/Withdrawn/Cancelled) spread over 30 days. | Don't wait on real MLS to start; exercises all three eligibility paths. |
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
| Alerts | Twilio SMS-to-self (primary) + Web Push API/PWA (enhancement) — see R11 |
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
- `contacts` (owner_id, kind ∈ {phone, email}, value, confidence_score, `dnc_status`, `dnc_checked_at`, `is_likely_cell`, `reassigned_checked_at`, `consent_basis` nullable)
- `buy_boxes` (name, criteria_json — county, zip set, price min/max, beds min, sqft min, equity_pct_min, occupancy_flag, exclusion_list)
- `lead_events` (property_id, buy_box_id, trigger_type, `eligibility` ∈ {`contactable`, `watch_only`, `held`} — derived from delisting status per §1, occurred_at, dismissed_at)
- `enrichment_jobs` (property_id, provider, status, response_json, cost_cents)

**Address normalization (don't reinvent):** use BatchData's normalized address as the canonical match key once a property is enriched; on raw ingest, run a USPS-style normalize step first so dedup + Module 2 idempotency are stable before enrichment lands.

**Buy-box rule engine:** declarative JSON criteria evaluated as a SQL filter at query time AND on each incoming status-change event. Single function — `propertyMatchesBuyBox(property, buyBox) → boolean` — reused everywhere.

**Acceptance test:** Seed 5,000 fake properties. Define 2 buy-boxes. Run match. Output count matches hand-counted SQL answer. Verify `lead_events.eligibility` is set correctly per status (Expired→`contactable`, Cancelled→`watch_only`, Withdrawn→`held`).

### Module 2 — Ingestion + status-change detection (Week 2–3)

**What:** Pull MLS data, detect status transitions to `Withdrawn` / `Expired` / `Cancelled`, fire `lead_events`.

- Inngest scheduled function polls MLS RESO Web API every **5 minutes** (or webhook subscription if broker supports it).
- Upsert into `properties`, append to `property_status_history` on any change.
- On transition into a "delisted" status, evaluate every active buy-box. For each match, insert a `lead_events` row, setting `eligibility` from the status (Expired→`contactable`, Cancelled→`watch_only`, Withdrawn→`held`).
- Idempotent: re-polling the same data must not produce duplicate events.
- Until live MLS access is online, use **a seed script** that replays a 30-day delisting stream of fake events at accelerated speed — proves the alerting pipeline.

**Acceptance test:** Replay seed-stream → exactly 100 `lead_events` rows created → re-run with no duplicates → handle a property that transitions Withdrawn → Active → Withdrawn correctly → a **Withdrawn** event surfaces as `held` (alert fires, contact actions blocked) while an **Expired** event surfaces as `contactable`.

### Module 3 — Enrichment + alerts (Week 3–4)

**What:** On every new `lead_event`, enrich the property + push an alert.

- Inngest `lead.created` workflow:
  1. Call BatchData "Property Lookup" → owner, equity, mailing address. (billable call #1)
  2. Call BatchData "Skip Trace" → up to 5 phones, 2 emails, ranked by confidence. (billable call #2 — each lead is **two** billable calls, see §9)
  3. Write to `owners` + `contacts`. Mark `eligibility=held` leads as enriched-but-contact-blocked.
  4. Build alert payload: address, owner name, top phone, "Was listed at $X for Y days. {Expired|Withdrawn|Cancelled} just now."
  5. **SMS-to-self via Twilio = primary alert channel** (reliable, time-critical; goes to my own number only — see §7).
  6. **Web Push = enhancement**, sent in parallel for the in-app deep-link. iOS Web Push is best-effort and must not be the only channel for the <10-min SLA (see R11).
- Cache: never re-trace an owner within 90 days. Log per-call cost to `enrichment_jobs.cost_cents`.

**Acceptance test:** Synthetic `lead_event` fires → SMS-to-self lands on my phone within **<10 minutes** including BatchData latency → enrichment data visible in app → cost row written (two BatchData calls logged) → a `held` (Withdrawn) lead shows enrichment but contact buttons are disabled.

### Module 4 — Lead inbox + DFD PWA shell (Week 4–6)

**What:** The phone-facing app.

- `/inbox` — list of `lead_events` newest first, swipe-to-dismiss, tap-to-open.
- Lead detail page — property info, owner contact (call/text buttons that open native dialer/SMS — **no in-app dialer**), map view, "snooze 7 days" / "discard" / "saved" actions.
- `/dfd` — map showing my current location + nearby properties (color-coded by buy-box match). Tap location → reverse geocode → "save to inbox" with on-demand BatchData lookup. Track route. Photo upload to Supabase Storage.
- DFD shares the **same enrichment + compliance-gate path** as alerts: an on-demand skip trace produces contacts that pass through the same DNC/RND posture (§7) before any contact action. DFD-sourced leads default to `watch_only` until a buy-box match is confirmed.
- **Privacy/storage note:** GPS route + photos are sensitive personal data. Set a Supabase Storage retention policy (e.g. purge routes/photos after N days) and keep this single-tenant; don't accumulate location history beyond what's useful.
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

> **Canonical detail + pre-ship checklist: [`COMPLIANCE.md`](./COMPLIANCE.md).** Summary below.

Blockers, in rough priority: **MLS data-use scope** (S2 — may be ungrantable), **real-estate solicitation / tortious interference** (S1 — the Withdrawn `held` flag), **A2P 10DLC** (sole-prop is days, not months), **TCPA/PEWC** (one-to-one rule vacated; PEWC reinstated Aug 2025), **manual-seller-call rules** (manual dial + call-window), **DNC + internal DNC list**, **Reassigned-Number scrub**, **state mini-TCPAs**, **CAN-SPAM** (when email lands), and **state wholesaling licensure** (SC/IL/OK restrict it — market choice gates legality).

**Strict rule for MVP:** Alerts (SMS-to-self + Web Push) go to **me only** — a personal notification, not third-party SMS. A2P + the seller-facing TCPA opt-in do not block MVP **if and only if** automated SMS is restricted to my own number. **However, the manual seller calls in the Definition of Done (§12) ARE regulated** — they must be manual-dial, DNC+RND-scrubbed, call-window-compliant, and Expired-only. The moment I send an *automated* text to a seller, A2P + PEWC must be complete.

---

## 8. Risk register

> **Canonical register: [`RISKS.md`](./RISKS.md).** Top risks below.

- **R1** — BatchData real-time API may have a **$2k/mo floor** (cost model ~20× swing). Confirm pay-as-you-go Week 1.
- **R2 (S2)** — broker/MLS may be **unable to legally grant** an off-market + outreach-permitted feed. **Project-killing**; gate Day 1, pivot data source if needed.
- **R4** — feed may refresh **nightly**, killing the <10-min moat before code starts. Confirm cadence Day 1.
- **R6 (S1)** — Withdrawn is neither contactable (legal) nor reliably motivated. `held` flag + ">60 DOM + price drop" filter.
- **R9** — TCPA/DNC litigation from skip-traced numbers. Manual dial + DNC/RND scrub + logging.
- **R10** — state wholesaling licensure (SC/IL/OK) gates legality. Confirm market before build.
- **R11** — iOS Web Push unreliable for <10-min delivery → SMS-to-self is primary.

---

## 9. Cost model (monthly, run-rate)

> **Canonical model + monthly actuals: [`COSTS.md`](./COSTS.md).** Headline below.

- **~$90/mo + MLS** at low volume (1k props, 30 alerts) — competitive vs. REsimpli's $149–599/mo.
- **Two big "ifs"** (both unconfirmed — R1/R2): the BatchData real-time API must be pay-as-you-go (else ~$2,090/mo, a ~20× swing) and the MLS feed must be affordable.
- Each lead = **two** billable BatchData calls (~$0.14–0.30/lead). One-time MLS broker setup ($500–$2k) is the real expense.

---

## 10. Day-1 long-pole work (start before code)

1. **Identify target market** — and **confirm the state permits unlicensed wholesaling at my intended cadence** before anything else (R10; SC/IL/OK restrict it). Then **shortlist 3 brokers** for MLS partnership and email all 3 today. In that email, ask the **gating question (S2/R2):** *"Can I receive Expired/Withdrawn/Cancelled statuses, does the data license permit contacting the owner, and how often does the feed update?"* — the last part validates the <10-min wedge (R4).
2. **Sign up BatchData**, **RentCast**, **PropMix** dev/sandbox accounts. First one to approve wins; the others are fallback. **Explicitly confirm whether the real-time/automated API is pay-as-you-go or has a monthly minimum (R1).**
3. **Provision Twilio account** + buy one local number in target market area code.
4. **Start A2P 10DLC sole-prop Brand + Campaign registration** (~1–3 days brand, ~10–15 days campaign — not the multi-month clock for vetted brands). Even if MVP doesn't need it, Phase 2 does.
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
│  └─ replay-delistings.ts
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
4. Use real APIs in dev (low volumes) against my sandbox accounts for **BatchData + Twilio** (available Day 1). **MLS is the exception:** until live broker access lands (weeks out), use the seed/replay harness — that is not a "mock" to be removed, it's the sanctioned MLS stand-in until the feed is live.
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

1. A real **Expired** event in my target MLS → SMS-to-self on my phone → owner + phone visible → tap-to-call works. A **Withdrawn** event alerts me but shows contact actions blocked (`held`). **End-to-end latency < 10 minutes.**
2. Buy-box rules let me filter to <50 alerts/month in a busy metro.
3. DFD route logs my drives; PWA installs on iOS and Android.
4. Monthly run-rate ≤ $150 at current volume — **contingent on the BatchData API being pay-as-you-go and an affordable MLS feed (R1, R2).**
5. I've called 5 sellers from **Expired-only** leads the system surfaced — each **manual-dial, DNC + RND-scrubbed, call-window-compliant** (§7), so this criterion no longer contradicts the compliance gates.
