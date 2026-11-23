# Extraction quality baseline (issue #20, phase 1)

This repository now has a deterministic offline scorer and thirteen **synthetic rendered page fixtures**. No user documents are included. Fixture images and annotations are dedicated to the public domain under CC0-1.0; the generator is project code under the repository license. All names, identifiers and example.test addresses are invented.

The starter corpus covers a clean invoice/table, rotated receipt, repeated labels and blank/checkbox fields, low-resolution letter, and a two-page demonstration agreement. Manifest entries link document ID and page number. This is a small development corpus, not evidence of industry-wide accuracy. Printed demonstration forms are not official ACORD or government forms.

## Run

`npm test` runs offline scorer tests only. It never calls a paid model.

Score saved page results with `npm run benchmark -- --predictions /path/to/predictions.json --out /path/to/report.json`. Predictions are an object keyed by manifest fixture ID; each value follows the existing core page extraction response. Missing predictions are scored as failures, not omitted. Extra IDs are flagged. Field matching uses exact normalized section/label plus occurrence order; whitespace normalization does not repair identifiers. Ground truth intentionally includes blank fields. Different-but-valid labels currently count as misses: review annotations and define aliases explicitly before comparing prompt versions.

An explicit paid run is `OPENAI_API_KEY=... npm run benchmark -- --live --max-pages 6 --out /path/to/report.json`. Set the key through your local environment, never commit it or put it into shell history. `--max-pages` is mandatory, execution is sequential, and each page is attempted once. Configure a provider project spending limit separately; a page cap is not a dollar cap. The benchmark runner now meters provider usage and estimates standard-model cost; missing usage remains explicitly unmeasured. The harness records Git HEAD and a SHA-256 hash of the prompt/schema source automatically. Set `BENCHMARK_REVISION` to override the tested Git SHA and `OPENAI_DOCUMENT_MODEL` to pin the model in the report. The prompt and schema live together in `packages/core/extraction.mjs`; record their source revision before making comparisons.

Reports store aggregate/per-page metrics, failure status and latency only. They do not save extracted values or source text. Local reports and predictions are ignored by git. Never commit real user documents or outputs. Offline scoring cannot attest to prediction provenance.

## Metrics and limitations

Classification requires document type and form number to match. Fields report non-null value precision/recall, unsupported-value rate, field coverage, and blank/checkbox/filled state accuracy. Evidence recall requires correct values and exact normalized source excerpts containing the value; this measures transcript evidence, **not image coordinates or independently verified page localization**. Table accuracy includes headers and annotated cells, while extra cells are counted separately. Undefined denominators are null, not fabricated 100% scores. Live reports include successful-call p50/p95 latency, individual failed attempts and missing-output penalties.

Still required before closing #20: text-PDF and scanned-PDF ingestion fixtures, handwriting, a measured multilingual/illegible baseline, mixed-PDF ingestion, page/coordinate evidence scoring, review-effort measurement, a representative baseline and regression thresholds based on that baseline. The initial nine-page live run now records provider usage and cost estimates; see [the measured baseline](reports/baseline-2026-11-22-v2.md). Existing per-page core is used unchanged; multi-page reconciliation is not implemented here. `reports/status.json` records this honest baseline status. Tests validate scoring behavior, not AI extraction quality.

## Vercel deployment plan

No additional application server is needed for this benchmark or the bounded server-side LangGraph workflow. Keep browser components free of orchestration dependencies. Existing Vercel extraction functions have a 120-second duration and core calls use a 90-second timeout; neither is automatically extended by adding LangGraph.

For durable jobs and human review, persist tenant-scoped job/checkpoint state in the existing Neon database and use managed durable execution (for example Vercel Workflows) with bounded steps. A LangGraph checkpointer is not itself a worker or scheduler. Document retention, access control, migrations and service costs must be designed before enabling durable processing. Do not use a function's local filesystem or an in-memory checkpointer as persistent production storage. Adding the benchmark changes no production API, credentials, storage or billing.

Official references: https://vercel.com/docs/functions/limitations and https://vercel.com/workflows . Verify the actual project plan and available features during implementation; this phase does not provision or enable Workflows.

## Compare versions

`npm run benchmark:compare -- --baseline /path/to/baseline.json --candidate /path/to/candidate.json --out /path/to/comparison.json` compares the same nonempty fixture set and category/quality groups. Both reports must have identical manifest and image-input hashes. Rerun older reports to include those hashes. Different prompt/schema hashes and models are allowed because these are the changes being evaluated; record them when interpreting results.

The command exits with status 1 when a higher-is-better metric decreases, unsupported-value rate increases, or extra table cells increase. `--max-drop 0.01` explicitly permits a one-percentage-point metric difference; it is a comparison setting, **not an established release threshold**. Undefined-versus-defined metrics are rejected as incomparable. No automatic production release gate is enabled until a real baseline and appropriate tolerances are measured. Malformed prediction shapes fail with a clear error instead of receiving misleading scores. Live and offline CLI modes cannot be combined, and unknown/missing flags are rejected before any paid call.

The optional server-side graph is now available for paired live experiments. Use `--engine pipeline` (default) or `--engine langgraph` with otherwise identical settings; both use the same core extractor and one call per page. See [LangGraph implementation](../docs/langgraph.md). No live comparison or adoption result has been claimed.

## Live baseline v2

The starter corpus now has nine synthetic rendered pages, adding upside-down, low-contrast and deliberately corrupted OCR variants. These are related variants of a small printed corpus, not nine independent real customer documents. Handwriting, multilingual coverage and full PDF/browser ingestion remain unmeasured.

Live runs record provider-reported input/output/cache token counts without saving requests, credentials or model text. Standard GPT-4.1 mini cost estimates use $0.40 input, $0.10 cached input and $1.60 output per million tokens (official model pricing checked 2026-11-22); other models/tiers or missing usage remain unpriced. `--max-cost-usd 0.50` uses a conservative per-request context/output upper bound before each call; it is a rate-based guard, not a provider billing limit. Page cap and no retry remain enforced. Stop after provider authentication/permission/rate-limit rejection. Vercel costs, taxes and discounts are excluded.

An isolated Vercel preview build can run the command with its existing preview credential and `--out web/benchmark-live.json`. Only the sanitized metrics report becomes a preview artifact; the key stays in Vercel. Ordinary deployments do not run a paid benchmark. This is an extractor/LangGraph evaluation on deployed source, not a test of browser OCR, UI uploads, login or quota enforcement. Source revision, hashes and actual model are recorded. A live report can contain conservative misses caused by exact label/section matching, not just unreadable values; interpret this strict contract score separately from semantic correctness.

A temporary branch-scoped preview variable `PAGESIGNAL_RUN_BENCHMARK=nine-page-v2` can authorize one bounded run during a development preview build. `scripts/optional-benchmark-build.mjs` refuses production and other branches. Remove the variable after the intended build starts; never set it on production. Ordinary builds only serve the static app and do not call a model.

## Corpus v3 and conservative rechecks

Version 3 adds four synthetic pages: Spanish invoice, French receipt, unreadable reference and a conflicting contract continuation. These additions are unmeasured; the historical nine-page v2 report remains unchanged. The conflict fixture links to agreement page 1 using documentId, but the scorer still measures each page independently: it does not measure reconciliation or mixed-PDF ingestion. Printed blocks represent deliberately obscured content, not handwriting. Thirteen synthetic pages do not establish general language/document support.

Optional graph rechecks still read the full rendered page; this increment targets the **merge**, not automatic image cropping or a cheaper provider call. Transcript-grounded corrections can update only unique uncertain fields. Established fields, blanks, checkbox states, metadata and tables are retained; conflicts/new fields require review. Empty/corrupt OCR cannot establish transcript support, so manual visual review/crop recheck remains necessary. One-call default and existing quota budgets stay unchanged. No new paid run or accuracy improvement is claimed.
