# Reference architecture
## PS-ARCH-001–013
1. Isolation: additive extension; no breaking core extraction/API changes; contract regression tests.
2. Domain: versioned account, submission, document, exposure, coverage, risk, quote and policy transaction contracts; separate bounded contexts.
3. Evidence: immutable source references (document, page, excerpt, optional coordinates); extracted vs reviewed values; provenance and correction history.
4. Intake: provider-neutral email/portal/API adapters, idempotency, file validation, malware scanning, job status and retries.
5. Documents: existing PageSignal extraction adapter, authorized revision-specific schemas, loss run/SOV parsers, deterministic validation.
6. Workflow: LangGraph for stateful AI-assisted tasks and human checkpoints where appropriate; deterministic business rules outside LLM; retry and cancellation semantics.
7. Rules: versioned appetite, authority, product and rating policies; effective dates, test fixtures, explanation and reproducible decision trace.
8. Persistence: tenant-scoped repositories, authorization on every operation, migrations, encryption, retention and deletion; no real customer data in demo.
9. Integrations: explicit ports for PAS, AMS, CRM, risk data, rating, carrier and claims systems; credentials server-side, timeouts and idempotent handoffs.
10. API: versioned contracts, validation, pagination, errors, authorization, rate limits, asynchronous job status and webhooks.
11. UI: separate opt-in /insurance/ workspace; reuse existing extraction review and source preview; dashboard, submission queue, review, risk summary, export; future modules disabled or omitted.
12. Governance: human approval for consequential decisions; audit, model/prompt versions, evidence quality, evaluation, privacy and jurisdiction-specific review.
13. Delivery: standalone tests, existing CI regression, synthetic fixtures, preview deployment, package compatibility, security review and release notes; no production rollout without approval.

## Dependency direction
Reference UI -> insurance API -> application services -> domain contracts and ports.
Adapters implement ports and call existing PageSignal extraction, external systems or storage. Domain modules must not depend on UI, databases or LLM providers. No new mandatory infrastructure for library consumers.

## Design constraints
Money uses exact minor units with currency; dates and jurisdictions explicit. No automatic bind/decline from AI output. No proprietary data, licensed form reproduction or unverified carrier connectivity. Self-hosting does not automatically mean offline inference: customer-selected model providers and data boundaries must be configured.
