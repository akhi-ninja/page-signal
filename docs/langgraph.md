# Optional LangGraph document orchestration

Server-side implementation uses pinned LangGraph.js 1.7.5. The default extraction path is unchanged. React, Angular, Vue, core and SDK package dependencies do not include LangGraph. The root application installs LangGraph and its Postgres checkpointer for server use only; this is not a new published npm package.

## Hosted Node / Vercel integration

Set `PAGESIGNAL_ORCHESTRATOR=langgraph` in the server environment to select the graph for page extraction. Leave it unset or set `pipeline` to roll back. The existing `/api/ai/extract` route and JSON response shape are preserved. GitHub/LinkedIn session verification, origin checks, body limits and quota reservations run before extraction. Document questions still use the existing source-grounded query handler.

The graph runs inspect → extract → deterministic validation → optional recheck → review result. It classifies/extracts through the same OpenAI page prompt as the simple pipeline. It does not create an LLM agent for each field. Validation flags unknown classification, malformed fields, invalid emails, inconsistent checkbox/blank states and table dimensions; it does not claim semantic verification of every value against the image. Results with validation findings require review. Users still review/edit fields and export in the existing UI.

`PAGESIGNAL_GRAPH_RECHECK=true` allows at most one additional model call when validation flags a problem. It is off by default. In hosted account mode, the additional call reserves another request against the same authenticated user's minute/day/global limits; if denied, the original result is returned for review. In token mode no extra call is allowed by the default adapter. A worse recheck (more validation issue categories) does not replace the initial result. Provider errors fail the request; there is no unbounded automatic retry or silent fallback that could duplicate charges.

Each graph provider call is limited to 45 seconds, total graph execution to 105 seconds, under the existing 120-second Vercel function configuration. Cancellation is passed to provider fetch. This is request-bound execution, not a background job service. No new server, database migration or storage is required for this mode. It does not save uploaded pages/checkpoints. Model API and Vercel usage costs still apply. Test the feature in preview before enabling production; this change does not edit deployment environment variables.

`X-PageSignal-Orchestrator`, `X-PageSignal-Model-Calls` and `X-PageSignal-Review-Required` identify the executed path. Setting LangSmith/LangChain tracing environment flags causes the graph adapter to fail closed unless `PAGESIGNAL_ALLOW_EXTERNAL_TRACING=true` explicitly authorizes tracing. Traces can contain document contents; tracing is not enabled by this implementation.

## Checkpointed human approval (server integration API)

`createPageWorkflow` in `lib/document-workflow.mjs` accepts a caller-owned checkpointer and `requireApproval:true`. Its review node interrupts before completion. `resume({approved:true,result:editedResult}, config)` validates corrections and completes the workflow. `resume({approved:false}, config)` rejects and removes the export result from the terminal state. Resume on a fresh workflow instance reuses checkpoints and does not repeat extraction. Page images/OCR remain in the invocation closure, outside checkpointed state; extracted fields and approval history are still sensitive persisted data.

`createWorkflowStore(pool)` in `lib/workflow-checkpointer.mjs` supplies a dedicated Postgres schema (`pagesignal_workflows`), scoped thread configuration and explicit thread deletion. It can use the existing server-side Neon Postgres pool. Run `npm run workflow:migrate` once with DATABASE_URL before using this store; migrations are explicit and never run inside a document request. Do not end a shared auth pool when disposing of a workflow. MemorySaver is used in tests only and is not durable production storage.

```js
import { createWorkflowStore } from '../lib/workflow-checkpointer.mjs';
import { createPageWorkflow } from '../lib/document-workflow.mjs';

// pool and session come from the trusted server; document ownership must be checked first.
const store = createWorkflowStore(pool);
const config = store.config({tenantId:session.user.id,documentId:ownedDocument.id});
const workflow = createPageWorkflow({page,extractPage:yourQuotaCheckedAdapter,
  checkpointer:store.checkpointer,requireApproval:true,maxCalls:1});
const paused = await workflow.start(config);
// In a later authenticated request, verify ownership again and reconstruct the workflow.
const finished = await workflow.resume({approved:true,result:editedResult},config);
// On document deletion/retention expiry:
await store.delete({tenantId:session.user.id,documentId:ownedDocument.id});
```

Hashed tenant/document IDs avoid accidental thread collisions; hashing is not authorization. The server must derive tenant ID from a verified session, verify document ownership, serialize mutations per document, and authorize start/resume/delete. Do not expose caller-supplied `configurable`, `thread_id` or tenant IDs on public routes. This PR deliberately exposes no public checkpoint CRUD/resume endpoint, so it does not create an unaudited persisted document library. Integrators must define retention and schedule deletion of checkpoint history, including rejected documents. Database persistence, locks and resume routes need a deployed integration test before production use. A checkpointer alone does not schedule work after an invocation ends; durable background execution remains #24.

State uses schema version 1 and scoped thread identity `pagesignal-page-v1`. Deploy a new identity/version when changing incompatible graph state or node ordering; do not resume incompatible checkpoints. External tracing remains opt-in.

## Tests and evaluation

`npm test` exercises the actual LangGraph runtime with deterministic provider adapters: clean runs, bounded rechecks, denied quota, pause/edit/resume across graph instances, rejection, result compatibility, tracing protection and two-call hosted accounting. These tests prove workflow behavior, not live model accuracy. The Postgres helper is implemented but no production Neon migration or durable worker deployment was performed.

Use `npm run benchmark -- --live --max-pages 6 --engine pipeline --out /path/pipeline.json` and the same command with `--engine langgraph` to evaluate both against identical fixtures, model and prompt. The experiment uses one model call per page in each engine for equal budgets. Compare with `npm run benchmark:compare`. Neither engine is proven more accurate, cheaper or faster until measured. LangGraph is implemented as an opt-in experiment; issue #26 remains open for the measured adoption decision and production durability evaluation.

References: https://docs.langchain.com/oss/javascript/langgraph/graph-api , https://docs.langchain.com/oss/javascript/langgraph/interrupts , https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-postgres/index/PostgresSaver .

## Conservative second-pass merging

The optional second pass now preserves the successful first extraction when the recheck fails or is malformed. Only unique uncertain fields with literal transcript-supported evidence can be replaced. Document type/form identity drift, established-value conflicts, repeated-label ambiguity, newly discovered fields and table changes are retained as review findings instead of silently replacing the original. Existing tables, blank/checkbox states and manually reviewed fields are not auto-overwritten. These checks establish consistency with the transcript, not visual truth. Whole-page model calls remain bounded to two with an additional quota reservation; automatic crop selection is not introduced. The default remains one call. Tests demonstrate merge safety, not improved model accuracy.
