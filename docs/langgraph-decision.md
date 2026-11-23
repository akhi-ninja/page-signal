# LangGraph decision record

Decision: retain optional server-side LangGraph for explicit workflow state, bounded review/recheck branching and tested checkpoint resume. Keep ordinary deterministic validators/reconciliation in plain modules and browser packages free of LangGraph. Durable background delivery comes from Vercel Queues; LangGraph alone does not keep a function running or recover a paid call after an uncertain crash.

Both benchmark engines use the same core model, prompt, page schema and one-call budget. A graph cannot inherently improve the output of that identical single call. Compare actual paired reports before asserting latency/cost/accuracy differences. Stochastic differences between single runs are not statistically significant benefits. Do not automatically enable crop rechecks or change production mode based on a tiny corpus.

The quality suite includes page validation, transcript evidence, review-only crop proposals, document-boundary/conflict preservation, human approval and durable job isolation. No separate autonomous agent per field is introduced. External content is untrusted data; source instructions never authorize tools or change ownership/quotas.

Review burden is currently an automated count of flagged fields. Human minutes/corrections are not measured and must remain null. Restart-recovery guarantees are tested at the page job boundary: a crashed in-flight paid attempt requires explicit retry, rather than claiming exactly-once billing. Postgres checkpointer pause/resume is tested across instances, but its historical plaintext result state remains caller-owned; the job API uses encrypted result state instead.

Root server dependencies add LangGraph, its Postgres checkpointer, queue SDK and Sharp; the simple extraction package has none of them. Dependency footprint and maintainability costs are explicit: extra state/lease/encryption/queue transitions require integration monitoring, while the one-call simple pipeline remains the smallest execution option. Browser bundle guards continue to reject server-only dependencies.

Status: code and deterministic validation can be completed independently of paid evaluation and production provisioning. The paired live report, real provider/queue smoke test and representative human review study must be recorded separately. Do not mark these measured merely because tests pass.
