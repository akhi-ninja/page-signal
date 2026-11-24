# PageSignal Insurance — master roadmap
Status: proposed architecture baseline, 2026-11-24. Delivery order is dependency-based, not a date commitment.

## Mission
Provide independently adoptable MIT-licensed insurance building blocks, APIs and reference applications for carriers, MGAs, brokers and implementation partners. Preserve existing PageSignal extraction, SDKs, public contracts and deployment behavior. Commercial P&C first; personal lines, health and life are separate future bounded contexts. Optional hosting, support and integration services are not required to use the code.

## Release gates
| Milestone | Priority | Scope | Acceptance gate |
|---|---|---|---|
| M0 Foundation | P0 | PS-01–03 | Existing regression and insurance tests green; isolated package; reviewed PR |
| M1 Submission MVP | P0 | PS-04–09, PS-28 | Synthetic end-to-end submission, evidence review, missing/conflict resolution, export; secure tenant-scoped persistence before real data |
| M2 Underwriting MVP | P0 | PS-10–14 | Versioned appetite and authority rules, clearance, referrals, audit and reproducible decisions |
| M3 Configuration and quoting | P1 | PS-15–20 | Configurable products, workflow designer, deterministic rating adapters, quote revisions and approved handoff |
| M4 Servicing and portfolio | P2 | PS-21–24 | Renewal/endorsement workflows, exposure and operational reporting, core-system integration |
| M5 Extended lifecycle | P3 | PS-25–27 | Claims intake, delegated authority/reinsurance and separately scoped verticals |

## Initial product scope
Commercial property first, then general liability, commercial auto, workers compensation, BOP and commercial package. Umbrella, cyber, professional liability, D&O, EPLI, inland/ocean marine, builders risk, environmental, equipment breakdown and surety follow customer validation. No claim of production readiness or full regulatory coverage.

## Current baseline
Foundation, starter commercial profiles, draft risk contracts, conservative ACORD marker identification and exact revision-profile selection implemented on PR #62. Latest pre-documentation package checks passed. UI flow is specified, not implemented. ACORD mapping, real document benchmarks and all downstream modules remain planned. PR mergeability must be rechecked before merging.

## Adoption modes
Library-only; API-only; self-hosted reference UI; embedded UI components; integration adapters. Start with subpath modules inside extensions/insurance, split into separately published packages only after contracts stabilize. Do not bundle licensed forms, carrier rate tables or proprietary datasets.

See [capabilities](CAPABILITIES.md), [architecture](REFERENCE-ARCHITECTURE.md), [epics](EPICS.md), [competitive references](COMPETITIVE-REFERENCES.md) and [UI flow](../UI-FLOW.md).
