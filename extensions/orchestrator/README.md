# PageSignal Orchestrator

LangGraph-powered server-side document workflows for Node.js 22+. Public developer preview, MIT licensed.

[Documentation](https://www.pagesignal.studio/docs#pagesignal-orchestrator) · [Releases](https://www.pagesignal.studio/releases) · [npm](https://www.npmjs.com/package/@pagesignal/orchestrator)

```bash
npm install @pagesignal/orchestrator
```

Supply your own server extraction adapter and rendered page in this integration example.

```js
import { createPageWorkflow } from '@pagesignal/orchestrator';
const workflow = createPageWorkflow({
  page: { image: jpegDataUrl, text: ocrText },
  extractPage: page => myServerExtractionAdapter(page)
});
const state = await workflow.start({ recursionLimit: 16 });
console.log(state.status, state.result, state.issues);
```

The application supplies rendered JPEG pages, OCR, credentials, authentication, quotas and storage. Default is one model call; a second requires maxCalls: 2 and an explicit reserveAdditional callback returning true. Optional prepareRecheck is caller-owned. Evidence checks are review hints, not proof of accuracy.

For human approval, provide a caller-owned LangGraph checkpointer and requireApproval: true. Use workflowConfig with authenticated tenantId and unique page/document workflow ID; reuse the same configuration and original page on resume. Authorize each resume server-side. Do not run concurrent invocations on the same thread. Checkpoints contain sensitive extracted results; enforce access controls, encryption, retention and deletion. External tracing is blocked unless explicitly authorized. No database is created by this package.

## Migration

Existing core, SDK, framework and Sync consumers need no changes. This preview is opt-in and does not replace the hosted server engine. Self-hosted server operators should follow docs/langgraph.md and docs/document-jobs.md for server configuration and applicable database migrations. Do not enable durable jobs until infrastructure and migrations are ready. No browser imports or provider secrets in client code.
