# Durable document jobs and bounded rechecks

This source increment adds an optional Vercel Queues worker around the existing server-side page LangGraph. No additional always-on server is required. Queue delivery and Neon storage are separate services with usage charges. Existing synchronous extraction stays compatible.

## Configuration and rollout

Jobs fail closed unless `PAGESIGNAL_DURABLE_JOBS=true`. Before enabling that flag, run `npm run jobs:migrate` with the intended DATABASE_URL and confirm the queue callback/retention trigger in preview. Existing BETTER_AUTH_SECRET derives the AES-256-GCM state-encryption key using a separate domain; rotating this secret makes old job contents unreadable, so delete/expire jobs before rotation. Keep secrets server-side. Configure a random CRON_SECRET of at least 32 characters for the daily retention route. No job database migration is run automatically during normal builds or requests.

The `pagesignal_document_jobs` table is additive and explicit. Consumer `/api/internal/document-jobs` is private through its Vercel queue/v2beta trigger; SDK receives the real message from the queue by receipt, rather than trusting arbitrary HTTP JSON. Messages contain only an opaque job ID. Database ownership and verified account status are derived server-side. The standard verified-user minute/day/global AI quotas apply before every provider attempt. Jobs use one model call per page attempt, with at most two attempts; no nested graph recheck in the background worker.

Existing in-memory browser workspaces do not become persistent automatically. To use the new job mode, integrate `@pagesignal/sdk/jobs` with a same-origin session-authenticated endpoint. No bearer/OpenAI credential belongs in that browser client. This source is ahead of npm publication.

## API

`POST /api/ai/jobs` JSON `{idempotency_key: "random-key-123", pages:[{page:1,image:"data:image/jpeg;base64,...",text:"..."}]}` returns 202 with the opaque ID. Maximum streamed body is 4,000,000 bytes, 1–40 distinct original page numbers, each image <=3,800,000 characters and text <=20,000 characters. Submit smaller rendered documents if the whole job exceeds the body limit. Serialized review/export responses are capped at 3.5MB; a page that would exceed that output budget fails explicitly instead of truncating fields. Split the job into smaller documents in that case. Reuse the same key and identical input after a network/queue-send failure; changing input with that key is rejected.

`GET /api/ai/jobs?id=ID` returns status, page attempts, sanitized errors, metrics and partial document JSON. Sources/text/images are not returned. `POST` to that same URL with `action: "cancel" | "retry" | "approve"` performs an owner-only transition. Retry applies only to failed pages below the two-attempt cap. Approval requires all pages to succeed; optional `pages` contains the same page numbers and corrected page result objects. Review data is validated and encrypted; approval preserves per-page provenance and conflict records. `DELETE` removes the owner's job and its persisted input/result/review state. Wrong-owner, missing, deleted and expired IDs return the same not-found response.

Cancellation prevents later page processing and discards late completion writes. A provider call already in flight may still finish and be billed; it cannot be recalled across serverless instances. Use DELETE for data removal. Do not treat cancellation as deletion.

## Recovery and cost control

Postgres row locks and an opaque lease token serialize each job. A live lease prevents parallel attempts; redelivery waits. If a worker disappears after a possible paid call, a stale processing page becomes `interrupted_attempt_requires_review` instead of silently repeating the charge. Explicit user retry is permitted only below the attempt cap. Completed pages are not rerun; their image/text payload is removed from encrypted state immediately.

Only explicit provider rate-limit rejections are automatically retried, with bounded Retry-After plus jitter. Authentication/invalid requests, ambiguous timeouts, malformed output and uncertain crashes require review. Queue infrastructure retries are capped at five deliveries; they are not permission for extra model calls. If delivery expires or is exhausted, users can retry creation with the same key or explicitly retry failed pages. Queue and database are not a distributed transaction; the idempotent API and redelivery path make recovery explicit.

At most five retained jobs per owner and 100 retained jobs globally are admitted under a transaction lock. Every provider attempt consumes the existing account quota. Page-level safe metrics record latency, attempt count and provider-reported token/cost headers where available; missing usage is null, not zero. Cost estimates only cover measured default-tier GPT-4.1 mini tokens at the documented standard rates, excluding infrastructure/tax. No content-based cross-user cache is introduced.

## Retention, privacy and authorization

Each job expires after 24 hours: read, worker claim, retry and approval deny access afterward. Owner DELETE removes it immediately. A daily authenticated retention task removes expired ciphertext, so physical removal normally occurs by the next daily run (up to approximately 48 hours from creation); operations also opportunistically prune expired rows. Monitor scheduler failures; access expiry is independent of scheduler availability. Backups follow the database operator's separate retention policy. Job state has no LangGraph checkpoint image duplication; page graphs are invocation-local and durable outcomes are encrypted at the job boundary.

No document content is written to queue messages or application diagnostics. LangGraph external tracing remains off/fail-closed unless explicitly consented and configured; it must not be enabled merely to debug jobs. Existing standalone LangGraph checkpointer integrations remain caller-owned and need explicit thread deletion/retention; jobs do not expose arbitrary thread IDs or checkpoint CRUD.

## Crops and reconciliation

`PAGESIGNAL_GRAPH_RECHECK=true` plus `PAGESIGNAL_GRAPH_TARGETED_RECHECK=true` enables one optional crop recheck on the synchronous hosted path. Trusted-coordinate hints are derived from uploaded-page PDF/OCR words, not model-generated boxes. Ambiguous/repeated/label-only matches, large regions and malformed images are skipped before reserving the extra quota. Images are decoded with a 20-million-pixel cap; the selected crop is padded, bounded to 1200px and 1.5MB JPEG. Only one unique uncertain field is considered. Caller-supplied coordinate hints are not proof of correctness.

Crop results are proposals in `vision_recheck`, never silent repairs. The existing UI displays them through its explicit Use this value review control. OCR disagreement, classification ambiguity and unreadable crops remain needs-review. The original first-pass fields are preserved. The page number comes from the source upload; crop coordinates use normalized top-left origin on the upright page.

`@pagesignal/sdk/document` and its generated browser copy expose a versioned, validated document envelope. Explicit continuation pages group only with the immediately preceding compatible identity. First/standalone/unknown boundaries and failures split groups. Repeated fields retain section/page/occurrence IDs, original and whitespace-normalized values; conflicting values are kept. Matching table headers create reviewable continuation candidates; incomplete rows are never joined or guessed. Original page results/errors remain in JSON. This is conservative grouping, not semantic certainty about every mixed PDF.

## Validation boundaries

Tests use actual Postgres SQL through PGlite, real LangGraph and Sharp pixel crops, simulated provider failures and existing quota guards. They establish state transitions, isolation and bounded behavior, not a live Vercel Queue/Neon deployment or general extraction accuracy. Production enablement requires the preview migration, authenticated submission, queue-delivery, retention and restart checks. The new benchmark includes PDF.js ingestion, multilingual samples and artificial drawn strokes; real authorized human handwriting and human review-time measurements remain separate evidence requirements.

Official references: https://vercel.com/docs/queues/quickstart and https://vercel.com/docs/queues/sdk .
