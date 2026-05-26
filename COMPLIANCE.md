# Compliance gates — wholesale-crm

> Canonical compliance reference. These are **blockers**: do not ship a feature that violates them.
> Status current as of **May 2026**. Cross-referenced from `PLAN.md` §7 and `RISKS.md`.

## Gate table

| Requirement | What it is | Lead time | Day-1 action |
|---|---|---|---|
| **MLS data-use scope** (biggest blocker — see RISKS R2) | The data license must (a) deliver off-market statuses and (b) permit using the feed to contact owners. Most RESO/IDX/VOW licenses do **neither** — they're for displaying active inventory, and a broker who grants outreach rights can lose MLS access. | 2–8 weeks, **may be ungrantable** | Ask the explicit gating question of every broker Week 1: *"Can I receive Expired/Withdrawn/Cancelled, and does the license permit contacting the owner?"* Have a data-source pivot ready (county records; RedX/Vulcan7/Espresso Agent expired-listing data, each with own TOS). |
| **Real-estate solicitation / tortious interference** | **Withdrawn** owners are still under a listing agreement — soliciting them can be tortious interference + a state-commission violation. | Process | Enforce the `held` / `do_not_contact_until_confirmed_expired` flag in code (PLAN.md §1). Attorney review of outreach scripts. |
| **A2P 10DLC** | US carrier-mandated SMS registration. Without it, Twilio SMS is throttled/blocked. | **Sole-prop brand: 1–3 days; campaign ~10–15 days** (the multi-month clock is for standard/vetted brands). | Register sole-prop Brand + Campaign via Twilio Console (~$4.50 brand + $15 campaign vetting + $2/mo). Note T-Mobile raised pass-through carrier fees Jan 2026 (~$0.003–0.005/segment). |
| **TCPA — current standard** | The FCC one-to-one consent rule was **vacated by the 11th Circuit (Jan 2025)**; FCC **reinstated prior express written consent (PEWC)** (Aug 2025); the revocation-applies-to-all rule is delayed to **Jan 31, 2027**. PEWC is required before any SMS/autodialed call to a cell. Strict liability: $500–$1,500/violation. | Process | Build a PEWC opt-in flow before any seller SMS/autodial feature ships. |
| **Manual seller calls (MVP)** | Cold-calling Expired-listing owners is itself regulated even without an autodialer. | Process | **Manual dial only**, during legal call-window hours, DNC + RND scrub before the number is surfaced, log `consent_basis`/`dnc_status` per contact. |
| **DNC scrubbing + internal DNC list** | Scrub federal + state DNC every ≤31 days; maintain an internal company-specific do-not-call list. | Account setup | Vendor: free.dnc.gov (registration) or DNC.com (paid API). |
| **Reassigned Number (RND) scrub** | Skip-traced numbers are disproportionately reassigned cells; consent doesn't transfer to a new holder. RND check is the TCPA safe harbor. | Account setup | Scrub via the FCC Reassigned Numbers Database / DNC.com before contact; store `reassigned_checked_at`. |
| **State mini-TCPAs** | FL FTSA, WA, OK, MD and others impose stricter consent / call-window rules than federal. | Process | Confirm rules for the target state once chosen. |
| **CAN-SPAM (when email lands)** | Physical address + unsubscribe in every email. | None | Bake into email templates. |
| **State wholesaling licensure** (see RISKS R10) | SC effectively bans unlicensed wholesaling; IL caps unlicensed at ~1 deal/yr; OK's Predatory Real Estate Wholesaler Prohibition Act requires a license to market equitable interest. **Market choice gates legality.** | Process | Confirm the target state permits unlicensed wholesaling at my intended cadence **before** build. Attorney one-pager. |

**Strict rule for MVP:** Alerts (SMS-to-self + Web Push) go to **me only** — a personal notification, not third-party SMS. A2P + the seller-facing TCPA opt-in do not block MVP **if and only if** automated SMS is restricted to my own number. **However, the manual seller calls in the Definition of Done (PLAN.md §12) ARE regulated** — they must be manual-dial, DNC+RND-scrubbed, call-window-compliant, and Expired-only. The moment I send an *automated* text to a seller, A2P + PEWC must be complete.

## Pre-ship checklist (gate the MVP launch)

- [ ] Target state confirmed to permit unlicensed wholesaling at my intended cadence (attorney one-pager on file).
- [ ] Broker/MLS data-use agreement signed AND explicitly permits owner outreach on off-market statuses — or a pivot data source is in place.
- [ ] `held` flag enforced in code: Withdrawn leads cannot trigger any contact action.
- [ ] DNC scrub (federal + state) runs ≤ every 31 days; internal DNC list implemented.
- [ ] RND scrub runs before any number is surfaced for calling; `reassigned_checked_at` populated.
- [ ] Call-window hours enforced for manual seller calls.
- [ ] Automated SMS restricted to my own number until A2P + PEWC complete.
- [ ] (When email lands) CAN-SPAM physical address + unsubscribe in every template.
