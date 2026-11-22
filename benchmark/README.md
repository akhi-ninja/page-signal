# Extraction quality baseline (issue #20, phase 1)

This repository now has a deterministic offline scorer and six **synthetic rendered page fixtures**. No user documents are included. Fixture images and annotations are dedicated to the public domain under CC0-1.0; the generator is project code under the repository license. All names, identifiers and example.test addresses are invented.

The starter corpus covers a clean invoice/table, rotated receipt, repeated labels and blank/checkbox fields, low-resolution letter, and a two-page demonstration agreement. Manifest entries link document ID and page number. This is a small development corpus, not evidence of industry-wide accuracy. Printed demonstration forms are not official ACORD or government forms.

## Run

`npm test` runs offline scorer tests only. It never calls a paid model.

Score saved page results with `npm run benchmark -- --predictions /path/to/predictions.json --out /path/to/report.json`. Predictions are an object keyed by manifest fixture ID; each value follows the existing core page extraction response. Missing predictions are scored as failures, not omitted. Extra IDs are flagged. Field matching uses exact normalized section/label plus occurrence order; whitespace normalization does not repair identifiers. Ground truth intentionally includes blank fields. Different-but-valid labels currently count as misses: review annotations and define aliases explicitly before comparing prompt versions.

An explicit paid run is `OPENAI_API_KEY=... npm run benchmark -- --live --max-pages 6 --out /path/to/report.json`. Set the key through your local environment, never commit it or put it into shell history. `--max-pages` is mandatory, execution is sequential, and each page is attempted once. Configure a provider project spending limit separately; a page cap is not a dollar cap. Core currently does not expose usage, so token usage and cost are **null/unmeasured**. No paid model run was performed as part of adding this harness. The harness records Git HEAD and a SHA-256 hash of the prompt/schema source automatically. Set `BENCHMARK_REVISION` to override the tested Git SHA and `OPENAI_DOCUMENT_MODEL` to pin the model in the report. The prompt and schema live together in `packages/core/extraction.mjs`; record their source revision before making comparisons.

Reports store aggregate/per-page metrics, failure status and latency only. They do not save extracted values or source text. Local reports and predictions are ignored by git. Never commit real user documents or outputs. Offline scoring cannot attest to prediction provenance.

## Metrics and limitations

Classification requires document type and form number to match. Fields report non-null value precision/recall, unsupported-value rate, field coverage, and blank/checkbox/filled state accuracy. Evidence recall requires correct values and exact normalized source excerpts containing the value; this measures transcript evidence, **not image coordinates or independently verified page localization**. Table accuracy includes headers and annotated cells, while extra cells are counted separately. Undefined denominators are null, not fabricated 100% scores. Live reports include successful-call p50/p95 latency, individual failed attempts and missing-output penalties.

Still required before closing #20: text-PDF and scanned-PDF ingestion fixtures, handwriting, multilingual and illegible examples, mixed-page documents, page/coordinate evidence scoring, review-effort measurement, provider token usage/cost, an actual budgeted model baseline and regression thresholds based on that baseline. Existing per-page core is used unchanged; multi-page reconciliation is not implemented here. `reports/status.json` records this honest baseline status. Tests validate scoring behavior, not AI extraction quality.

## Vercel deployment plan

No additional application server is needed for this benchmark or a bounded server-side LangGraph experiment. Keep browser components free of orchestration dependencies. Existing Vercel extraction functions have a 120-second duration and core calls use a 90-second timeout; neither is automatically extended by adding LangGraph.

For durable jobs and human review, persist tenant-scoped job/checkpoint state in the existing Neon database and use managed durable execution (for example Vercel Workflows) with bounded steps. A LangGraph checkpointer is not itself a worker or scheduler. Document retention, access control, migrations and service costs must be designed before enabling durable processing. Do not use a function's local filesystem or an in-memory checkpointer as persistent production storage. Adding the benchmark changes no production API, credentials, storage or billing.

Official references: https://vercel.com/docs/functions/limitations and https://vercel.com/workflows . Verify the actual project plan and available features during implementation; this phase does not provision or enable Workflows.

## Compare versions

`npm run benchmark:compare -- --baseline /path/to/baseline.json --candidate /path/to/candidate.json --out /path/to/comparison.json` compares the same nonempty fixture set and category/quality groups. Both reports must have identical manifest and image-input hashes. Rerun older reports to include those hashes. Different prompt/schema hashes and models are allowed because these are the changes being evaluated; record them when interpreting results.

The command exits with status 1 when a higher-is-better metric decreases, unsupported-value rate increases, or extra table cells increase. `--max-drop 0.01` explicitly permits a one-percentage-point metric difference; it is a comparison setting, **not an established release threshold**. Undefined-versus-defined metrics are rejected as incomparable. No automatic production release gate is enabled until a real baseline and appropriate tolerances are measured. Malformed prediction shapes fail with a clear error instead of receiving misleading scores. Live and offline CLI modes cannot be combined, and unknown/missing flags are rejected before any paid call.
