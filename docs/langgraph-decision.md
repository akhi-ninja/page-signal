# LangGraph decision record

Decision: retain optional server-side LangGraph for explicit workflow state, bounded review/recheck branching and tested checkpoint resume. Keep ordinary deterministic validators/reconciliation in plain modules and browser packages free of LangGraph. Durable background delivery comes from Vercel Queues; LangGraph alone does not keep a function running or recover a paid call after an uncertain crash.

Both benchmark engines use the same core model, prompt, page schema and one-call budget. A graph cannot inherently improve the output of that identical single call. Compare actual paired reports before asserting latency/cost/accuracy differences. Stochastic differences between single runs are not statistically significant benefits. Do not automatically enable crop rechecks or change production mode based on a tiny corpus.

The quality suite includes page validation, transcript evidence, review-only crop proposals, document-boundary/conflict preservation, human approval and durable job isolation. No separate autonomous agent per field is introduced. External content is untrusted data; source instructions never authorize tools or change ownership/quotas.

Review burden is currently an automated count of flagged fields. Human minutes/corrections are not measured and must remain null. Restart-recovery guarantees are tested at the page job boundary: a crashed in-flight paid attempt requires explicit retry, rather than claiming exactly-once billing. Postgres checkpointer pause/resume is tested across instances, but its historical plaintext result state remains caller-owned; the job API uses encrypted result state instead.

Root server dependencies add LangGraph, its Postgres checkpointer, queue SDK and Sharp; the simple extraction package has none of them. Dependency footprint and maintainability costs are explicit: extra state/lease/encryption/queue transitions require integration monitoring, while the one-call simple pipeline remains the smallest execution option. Browser bundle guards continue to reject server-only dependencies.

Measured follow-up: the [19-page paired synthetic run](../benchmark/reports/paired-2026-11-23-v4.md) completed on Vercel preview. Field precision/recall were equal at 75/76; LangGraph evidence recall was lower (64/76 versus 71/76), with a higher observed p95 (7.324s versus 5.493s). Estimated model costs totaled $0.0461536. The sequential second run received cached tokens; no causal cost/speed/accuracy benefit is established. Preserve both one-call options and do not add agents or paid rechecks by default. Production behavior was not changed by this experiment.

Status: the paired synthetic experiment and source decision record are complete. Live authenticated queue/retention/restart validation, real crop quality evaluation, representative human handwriting and human review time remain pending. Do not equate passing deterministic tests with operational readiness or general accuracy.
