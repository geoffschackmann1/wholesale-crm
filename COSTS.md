# Cost model — wholesale-crm

> Canonical cost model + monthly actuals. Cross-referenced from `PLAN.md` §9 and `RISKS.md` R1/R2.

## Run-rate model (monthly)

> **⚠ Flagged assumption (single biggest cost risk — see RISKS R1):** the enrichment figures below assume BatchData's **real-time API is pay-as-you-go** (~$0.07–0.15/call). If the automated API requires the advertised **$2,000/mo floor**, the run-rate is **~$2,090/mo**, not ~$90/mo — a ~20× swing. Confirm before relying on these numbers.
> **Note:** each lead = **two** billable BatchData calls (Property Lookup + Skip Trace) → ~$0.14–0.30/lead, reflected below.

| Volume | MLS | BatchData enrichment (2 calls/lead) | Twilio (SMS to self) | Supabase | Vercel | Inngest | **Total** |
|---|---|---|---|---|---|---|---|
| 1k props tracked, 30 alerts/mo | wide variance, confirm w/ broker | ~30 × $0.30 = $9 | $1.15 number + ~$0.20 SMS | Free tier | Free tier | Free tier | **~$90/mo + MLS** |
| 10k props, 300 alerts/mo | (per-seat + data/vendor fees) | ~300 × $0.30 = $90 | $1.50 | Free tier | Free tier | Free tier | **~$130/mo + MLS** |
| 50k props, 1,500 alerts/mo | (range, often $50–300+/mo) | ~1,500 × $0.30 = $450 | $5 | $25 (Pro) | $20 (Pro) | $20 (Starter) | **~$600/mo + MLS** |

**One-time / annual fixed costs (omitted from the table above):** MLS broker setup ($500–$2k one-time + monthly), A2P sole-prop (~$24/yr, negligible), Apple Developer ($99/yr — only if iOS push forces a native app), optional DNC.com API subscription if scrubbing is automated.

*Compared to REsimpli at $149–599/mo + add-ons, breakeven is plausible at low volume — **but only if** the BatchData real-time API is pay-as-you-go and the MLS feed is affordable. Both are unconfirmed (RISKS R1, R2). Real expense is the **one-time MLS broker setup** + my time.*

## Actuals (update monthly)

| Month | Props tracked | Alerts | MLS | BatchData | Twilio | Infra | **Actual total** | Notes |
|---|---|---|---|---|---|---|---|---|
| _(first month)_ | | | | | | | | |
