# Versioned result contracts

The optional `@pagesignal/sdk/contracts` and `@pagesignal/core/contracts` exports share the same browser-safe runtime validators and TypeScript declarations. Existing extraction/query endpoints and native exports keep their legacy shapes. A new optional export is an additive feature; changing a versioned envelope's meaning, required fields or scalar types requires a new schema version and a major package release if an existing public contract changes. New exports can ship in a minor release. This source has not yet been published to npm.

Explicit converters:

```js
import {toPageEnvelope,validateEnvelope,migrateLegacyResult,mergeRequestedFields} from '@pagesignal/sdk/contracts';
const page=toPageEnvelope(legacyPage,{page:1,model:'your-recorded-model',prompt_version:'your-prompt-version'});
validateEnvelope(JSON.parse(JSON.stringify(page)));
const document=migrateLegacyResult(hostedExport,{kind:'workspace-v3'});
const fields=mergeRequestedFields(page.result.fields,queryResult,{queryId:'question-1'});
```

Do not guess versions from field names. `migrateLegacyResult` requires `kind: page | query | document | error | workspace-v3`. Workspace v3 migration requires an AI export with numbered page results; local-only/native custom adapter output is not silently upgraded into an AI page. For a native export made with a core-compatible adapter, convert `JSON.parse(controller.exportJSON(id)).extraction` using `kind: page`. Arbitrary custom adapter shapes require a caller-defined mapping; missing evidence is not invented.

| Contract | Version | Validation |
|---|---|---|
| Page | `pagesignal.page.v1` | Page identity, string/null fields and states, tables, unique occurrence IDs, review states, original/normalized values, source page |
| Document | `pagesignal.document.v1` | Numbered page results or typed errors, conservative grouping/conflicts/table candidates, approval state |
| Query | `pagesignal.query.v1` | Atomic scalar values, exact page evidence structure, distinct occurrence IDs and absent values with null source |
| Error | `pagesignal.error.v1` | Safe message/code, explicit retryability and bounded optional retry delay |

Runtime validation checks structure and internal consistency; it does not prove a model answer is true. Existing query grounding still compares quoted excerpts against numbered source text. A successful page is not automatically approved. Unknown schema versions fail closed.

Field IDs use page, exact section/label and occurrence ordinal; reordering indistinguishable repeated fields changes their occurrence identity. Original values are preserved, normalization collapses whitespace only, and explicit null originals remain null. Manual edits are marked reviewed by application code. Matching labels from a query never overwrite extraction fields: `mergeRequestedFields` appends a query-ID namespace and rejects replayed IDs. The hosted legacy export also suffixes colliding requested-field keys rather than overwriting extraction.

Evidence coordinates use normalized top-left origin on the upright rendered page (`normalized_upright_page`), with x/y in [0,1] and positive width/height inside that page. Page-number-only evidence remains valid when no reliable box exists. Rotation/resampling transforms and original dimensions are separately recorded in workspace `preprocessing`; original files are retained. Optional model, prompt_version and source_revision metadata must be supplied from measured runtime facts, not guessed.

The document envelope retains full per-page results and errors. `approved` applies to the envelope; conflicting values/table candidates remain visible for audit. `validateEnvelope` recomputes group structure to reject inconsistent groups. Table schemas preserve row width and null cells. It never joins ambiguous rows.

SDK is the canonical source. Run `node scripts/build-result-contracts.mjs` to generate core/browser copies, and `node scripts/build-document-contract.mjs` for the browser document module. `npm test` checks drift and round trips across all copies. Examples under `examples/contracts/` are synthetic and validated in tests. Packed-consumer CI checks published-style imports and TypeScript declarations; browser entries do not import server runtimes or credentials.
