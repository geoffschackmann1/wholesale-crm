# Risk register — wholesale-crm

> Canonical risk register. Cross-referenced from `PLAN.md` §8, `COMPLIANCE.md`, and `COSTS.md`.
> `S#` items are the show-stoppers called out in `PLAN.md`.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | BatchData's **real-time API has a monthly floor** (advertised "from $2,000/mo for 100k records"; ~$0.07/hit pay-as-you-go is documented only for one-off/UI lookups) | Medium | High | Confirm Week 1 whether the **automated real-time API** is pay-as-you-go. If it needs the $2k/mo floor the cost model jumps ~20× (see COSTS.md). Fallback: **RentCast** + **PropMix** + manual entry — and check *their* real-time API terms too, not just price. |
| R2 (S2) | **Broker/MLS cannot legally grant an off-market + solicitation-permitted feed** — not just "the partnership drags" | High | **Project-killing** | Ask the explicit gating question of 3 brokers in parallel Week 1 (COMPLIANCE.md). If none can grant it, pivot data source (county records / expired-listing vendors) before writing Module 2. Simulate with seed data meanwhile. |
| R3 | A2P 10DLC denied / delayed | Low | Medium | Sole-prop registration is ~1–3 days (brand) + ~10–15 days (campaign). MVP doesn't depend on third-party SMS; self-SMS only until A2P clears. |
| R4 | Real-time delisting isn't a real moat — **and the MLS feed may only refresh nightly** (RESO replication has rate limits), which kills the "<10 min" latency before code starts | High | High | Confirm the broker's **feed update cadence** Day 1. The wedge is **<10 min latency + auto-enrichment + my buy-box**; if the feed is nightly or PropStream's batch already wins, kill the project and save the money. |
| R5 | Web Push reliability on iOS | Medium | Low | Superseded by R11 — SMS-to-self is now the primary channel. |
| R6 (S1) | Withdrawn ≠ contactable (legal) **and** ≠ motivated (some relist next season) | High | Medium→High | **Legal:** `held` flag blocks contact on Withdrawn until confirmed expired (PLAN.md §1, COMPLIANCE.md). **Motivation:** filter to "delisted after >60 days on market + ≥1 price drop." Tune in Module 1's buy-box rules. |
| R7 | Owner contact info wrong / 50% bad phone rate | High | Medium | Multi-source: BatchData primary, REIPro/Whitepages secondary. Track per-source accuracy in `contacts.confidence_score`. |
| R8 | Solo build burns out at Module 3 | Medium | High | Force a working alert into my pocket by end of Week 4. The dopamine carries Module 4. |
| R9 | **TCPA/DNC litigation** from calling skip-traced numbers (strict liability $500–$1,500/violation; reassigned-number risk) | Medium | High | Manual dial only, DNC + RND scrub before surfacing a number, call-window enforcement, internal DNC list, per-contact consent/DNC logging (COMPLIANCE.md). |
| R10 | **State wholesaling licensure** — market choice gates whether the business is even legal (SC/IL/OK restrict it) | Medium | High | Confirm the target state permits unlicensed wholesaling at my cadence **before** build; attorney one-pager (COMPLIANCE.md, PLAN.md §10). |
| R11 | **iOS Web Push unreliable for time-critical (<10 min) delivery** (best-effort, may be coalesced/delayed) | Medium | Medium | Make **SMS-to-self the primary alert channel**; Web Push is the in-app deep-link enhancement only (PLAN.md §5 Module 3). |
