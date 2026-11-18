# PageSignal [![Sponsor PageSignal](https://img.shields.io/badge/Sponsor-PageSignal-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/akhi-ninja)

Turn PDFs and scanned images into document identities, editable fields, tables, and structured JSON. Use the web workspace, run your own API, or integrate the MIT-licensed packages.

[Open the app](https://www.pagesignal.studio/) · [Documentation](https://www.pagesignal.studio/docs) · [OpenAPI JSON](https://www.pagesignal.studio/openapi.json) · [Source](https://github.com/akhi-ninja/page-signal)

## Quick start

The hosted workspace requires GitHub sign-in before uploads, samples, local OCR, AI extraction, or document questions. LinkedIn and email sign-in are reserved for a later phase. Sign in before uploading when using a social provider, because social sign-in reloads the tab.

Use the web app for PDFs and scans. Choose the core package to call OpenAI from your server, the SDK to call a self-hosted PageSignal server, or the React package to embed the existing workspace.

| Interface | What it does | Credential |
| --- | --- | --- |
| Web workspace | Upload, identify, review, ask, export | Hosting access, if enabled |
| Community HTTP API | Extract a rendered page; ask about supplied page text | PageSignal service key |
| @pagesignal/core | Call the extraction engine in Node.js | Your OpenAI key |
| @pagesignal/sdk | Call your Community extraction endpoint | PageSignal service key |
| @pagesignal/react | Embed a same-origin workspace in an iframe | Host application handles access |

AI attempts open-vocabulary document identification, including ACORD, USCIS, invoices, receipts, and custom documents. Results depend on scan quality and visible evidence. Ambiguous forms and unreadable values need human review; complete or accurate extraction is not guaranteed.

## Web UI walkthrough

1. Open PageSignal and drag documents into the upload area, or choose Browse files. Try sample documents creates synthetic samples locally.
2. Local processing starts immediately. PDFs use their text layer where possible; scanned pages and images use English OCR in your browser. Progress appears on each document card.
3. To run AI immediately on new uploads, enable Use OpenAI vision extraction before uploading. Otherwise use the primary action at the top right of Extraction review. Its label is Extract all fields for one eligible file, or Identify N files with AI for multiple files. Confirm sending page images and OCR text to OpenAI.
4. The queue processes up to three documents concurrently. Pages within each PDF run sequentially; the shared local OCR worker processes one recognition task at a time. You do not need to click each document to start batch AI processing.
5. Select a completed card. The full-width workspace places extracted fields on the left and a large document preview on the right. Compare AI review, Fields, Raw text, and JSON with the preview. AI review includes the form title, number, revision, issuer, field states, tables, and review notes where detected. Edit incorrect values before exporting.
6. In Ask this document, enter requested labels such as policy number, effective date, and premium. Click Find specific fields to add editable key/value results with source evidence. Click Ask for a follow-up answer with page citations. The first question asks permission to send the extracted document text to OpenAI.
7. Click a field or citation to navigate to its source page and highlight matching PDF text or OCR words with an arrow. The preview supports page navigation, zoom and fit width. Repeated matches are identified; if no reliable position is found, the page is shown without a highlight. Handwriting and poor OCR can prevent precise matching. Supported atomic values returned with an answer can be added to fields; the answer sentence itself is not used as a field value. Ask further questions whenever needed.
8. Click Export JSON for the selected document. Export each document separately. Documents, edits, and conversation are held in this tab; export before closing or refreshing.

Without AI, local classification and template-based fields are available for a limited set of document types. Ask and Find specific fields require the server's OpenAI configuration. A failed AI page remains visible as an error or needs-review result; check every page before using its output.

## Upload and request limits

These are PageSignal application limits, not a statement of OpenAI's maximum upload limits. The UI renders PDFs locally and sends individual JPEG pages rather than uploading the PDF to OpenAI as a file.

| Limit | Value |
| --- | --- |
| Browser file types | PDF, PNG, JPG/JPEG, WEBP, BMP |
| Files per upload batch | 10 |
| Size per original file | 30 MiB |
| Combined original batch size | 100 MiB |
| PDF pages per file | 40 |
| API request body (Community server) | 4,000,000 bytes |
| JPEG data URL | At most 3,800,000 characters |
| OCR text per extraction request | At most 20,000 characters |
| Question | At most 2,000 characters |
| Query context | At most 6,000 characters |
| Query pages | 1–40 unique page numbers, each 1–40 |
| Total query page text | At most 160,000 characters |
| Concurrent Community API requests | 3 per server process |

Split larger PDFs or batches. Reduce page image dimensions or JPEG quality when a rendered page exceeds the request limit. API requests do not accept PDF binaries or multipart file uploads.

## Self-host with Node or Docker

Use Node.js 22 or later. Clone the repository and configure secrets in the server environment. Install the pinned dependencies before running the Node server.

```sh
git clone https://github.com/akhi-ninja/page-signal.git
cd page-signal
npm ci --ignore-scripts
export OPENAI_API_KEY='your-openai-key'
export PAGESIGNAL_API_KEY='your-random-service-secret-at-least-24-characters'
npm start
```

Open http://localhost:3000. The browser login username is pagesignal and its password is PAGESIGNAL_API_KEY. The default bind address is 127.0.0.1 and port is 3000. Set HOST and PORT when needed; use HTTPS through a reverse proxy for network access. The service uses one shared credential, not per-user accounts.

```sh
# Put OPENAI_API_KEY and PAGESIGNAL_API_KEY in a local .env file.
# The Docker runner reads it; npm start does not automatically load .env.
docker build -t pagesignal-community .
docker run --rm -p 3000:3000 --env-file .env pagesignal-community
```

OPENAI_DOCUMENT_MODEL optionally selects a compatible vision model with Structured Outputs. The current default is gpt-4.1-mini. Keep .env files and both keys outside version control. Self-hosted users pay their model and hosting charges.

## API authentication

The examples below target your self-hosted Community Node server. Send Authorization: Bearer YOUR_PAGESIGNAL_API_KEY. The service credential is not your OpenAI key. The Community server authenticates all routes, including status and documentation, and also accepts the browser's Basic authentication.

The Vercel web deployment uses verified account sessions for both extraction and document queries. Its extraction handler requires a matching Origin header, JSON content type, and a verified email. A PageSignal service bearer token does not authenticate the hosted handler. Hosted AI fails closed until the account database, migrations, secrets, and providers are configured. Use the Community service mode for SDK/API integrations. Keep deployment protection enabled on previews as an additional boundary.

Hosted accounts default to 20 AI requests per day and 6 per minute, with a global cap of 200 per day. These are request attempts, not document counts or paid credits. Each page and question counts separately; attempts may count even if they fail. The account dialog shows remaining daily requests. Quotas use PostgreSQL and reset at 00:00 UTC; limits are configurable by the operator. See [authentication setup](https://github.com/akhi-ninja/page-signal/blob/development/docs/auth-setup.md). Set PAGESIGNAL_AUTH_MODE=accounts on the Node runner to use the same account flow instead of shared service mode.

## API: configuration status

GET /api/ai/status reports whether the server has a provider credential. It does not make a provider request or validate billing or model access.

```sh
curl http://localhost:3000/api/ai/status \
  -H "Authorization: Bearer $PAGESIGNAL_API_KEY"
```

```json
{"configured": true, "provider": "OpenAI"}
```

## API: extract one page

POST /api/ai/extract accepts JSON with image (a base64 JPEG data URL) and text (an OCR transcription; pass an empty string if unavailable). Render PDFs to JPEG pages in your application and call once per page. The raw HTTP handler requires text; the core and SDK methods default it to an empty string.

Create a request from a local JPEG using Node.js, then submit it:

```sh
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; writeFileSync("page-request.json", JSON.stringify({image:"data:image/jpeg;base64,"+readFileSync("page.jpg").toString("base64"),text:""}));'
curl http://localhost:3000/api/ai/extract \
  -H "Authorization: Bearer $PAGESIGNAL_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @page-request.json
```

Illustrative page response (shortened values, complete top-level shape):

```json
{
  "document_type": "invoice",
  "document_title": "Invoice",
  "form_number": null,
  "form_revision": null,
  "issuer": "Example Company",
  "classification_status": "identified",
  "classification_evidence": ["Invoice heading"],
  "page_role": "standalone",
  "fields": [{"section": null, "label": "Invoice number", "value": "INV-1042", "state": "filled", "evidence": "Invoice number INV-1042"}],
  "tables": [{"title": "Items", "columns": ["Description", "Amount"], "rows": [["Service", "125.00"]]}],
  "review_notes": []
}
```

Classification status is identified, needs_review, or unidentified. Page role is first, continuation, standalone, or unknown. Field state is filled, blank, illegible, checked, or unchecked. Extracted page values remain strings or null; visible tables preserve column/row structure. Classification evidence and field evidence should still be compared with the original.

## API: specific fields and questions

Use the same POST /api/ai/extract route with operation: document_query. Supply numbered page text yourself; the server does not remember a previous extraction or store a document ID. For mode: fields, request the desired labels in question. For mode: chat, ask a natural-language question. Always include context, even if it is empty.

```json
{
  "operation": "document_query",
  "mode": "fields",
  "question": "Find the notice period and termination fee",
  "context": "",
  "pages": [{"page": 1, "text": "Provide 60 days written notice. The termination fee is $250."}]
}
```

Save that JSON as query-request.json and submit:

```sh
curl http://localhost:3000/api/ai/extract \
  -H "Authorization: Bearer $PAGESIGNAL_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @query-request.json
```

Illustrative field result:

```json
{
  "answer": "The notice period is 60 days and the termination fee is $250.",
  "citations": [{"page": 1, "excerpt": "60 days written notice"}],
  "fields": [
    {"label": "notice period", "value": "60 days", "source": {"page": 1, "excerpt": "60 days written notice"}},
    {"label": "termination fee", "value": 250, "source": {"page": 1, "excerpt": "termination fee is $250"}}
  ]
}
```

Query values can be string, number, boolean, or null. Missing or unsupported values return null with source: null. Citations contain a page number and verbatim excerpt checked against supplied text. Excerpt validation is not a guarantee that every answer is semantically correct. For a follow-up, resend pages, set mode to chat, and include relevant prior conversation in context. Chat responses use answer and citations and may include supported atomic values in fields. Returned field values must be supported by their cited excerpts; malformed or guessed emails are rejected. Queries search supplied text, not the original page images. The web app includes successful AI-extracted page fields when available. Run vision extraction before questioning unclear scans; unreadable values may remain null.

## JSON output formats

The API returns a single page's extraction or a query result. The web UI builds a separate document-level export with schema_version: 3.0. Do not expect the HTTP API to return the same wrapper as Export JSON.

A UI export includes fields (normalized snake_case keys), evidence keyed the same way, source (file_name, page_count, ocr_pages), document_type, form_number, raw_text, and local extraction data. AI exports also include pages, document_title, classification_status, processing_status, and local_classification. The document may be mixed_documents when distinct forms are found in one file. Pages with errors remain in pages. Repeated extracted labels receive suffixes such as _2. Requested field labels use normalized keys and may replace a matching existing field key.

```json
{
  "schema_version": "3.0",
  "document_type": "invoice",
  "fields": {"invoice_number": "INV-1042", "is_paid": false, "due_date": null},
  "evidence": {"invoice_number": {"page": 1, "excerpt": "INV-1042", "reviewed": false, "status": "filled"}},
  "source": {"file_name": "invoice.pdf", "page_count": 1, "ocr_pages": []}
}
```

This is an abbreviated UI example. Checkbox states become booleans in normalized fields; other extracted page values remain strings or null. Manually edited requested values become strings or null. Export results after reviewing and correcting values.

## Core package

Run the extraction engine directly in your Node.js 22+ backend. It calls OpenAI using your own provider credential and does not require a running PageSignal server.

```sh
npm install @pagesignal/core
```

```js
import { readFile } from 'node:fs/promises';
import { extractPage, PageSignalError } from '@pagesignal/core';

const jpeg = await readFile('page.jpg');
try {
  const result = await extractPage(
    { image: `data:image/jpeg;base64,${jpeg.toString('base64')}`, text: '' },
    { apiKey: process.env.OPENAI_API_KEY }
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof PageSignalError) console.error(error.status, error.message);
  else throw error;
}
```

extractPage({ image, text = '' }, { apiKey, model }) returns a page response. Optional model overrides the default. HTTP failures expose PageSignalError.status. PDF rendering, OCR, authentication, storage, billing, and multi-page orchestration belong to your application. This package currently exposes page extraction, not a document-query convenience method. Never put OPENAI_API_KEY in browser code.

## SDK package

Call a running Community server from a Node.js 22+ backend. Use the PageSignal service key; the provider key stays on that server.

```sh
npm install @pagesignal/sdk
```

```js
import { readFile } from 'node:fs/promises';
import { PageSignalClient } from '@pagesignal/sdk';

const client = new PageSignalClient({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.PAGESIGNAL_API_KEY,
  timeoutMs: 120000
});
const jpeg = await readFile('page.jpg');
try {
  const result = await client.extractPage({
    image: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    text: ''
  }, { signal: AbortSignal.timeout(60000) });
  console.log(result.document_type, result.fields);
} catch (error) {
  console.error(error.status, error.message);
}
```

The constructor also accepts fetch for a custom transport. baseUrl is reduced to its origin, so path prefixes are not supported. It rejects embedded URL credentials and redirects. The default timeout is 120,000 ms. Service errors expose error.status; cancellation/network errors may not. SDK extractPage processes one JPEG page, not a PDF file. Use raw HTTP for document_query; a query convenience method is not yet exported. Keep the SDK and service key on your server.

## React package

Embed the existing workspace in React 18 or 19. This package is an iframe wrapper, not a native upload component or a backend.

```sh
npm install @pagesignal/react react react-dom
```

```jsx
import { PageSignalWorkspace } from '@pagesignal/react';

export default function Documents() {
  return <PageSignalWorkspace
    src="/pagesignal/"
    title="Document extraction"
    height="850px"
    className="document-workspace"
  />;
}
```

Host or reverse-proxy the Community workspace at /pagesignal/ on your app's origin. Map /pagesignal/app.js, /pagesignal/engine.js, and /pagesignal/style.css to the corresponding Community assets, proxy /account.js and /document-viewer.mjs in both service and account modes, and map /api/ai/* to the Community API. Account deployments must also proxy /api/auth/* and preserve cookies and Origin. These API paths are absolute in the bundled UI. The component accepts src, title, height (CSS string), and className. src must be a same-origin path, not an external URL. In Next.js, use it from a client component.

Authenticate users in your application. A server-side proxy can attach the Community service token after checking the session; do not expose it as an iframe prop. No result callbacks or document events are exported; use the workspace's Export JSON button. Programmatic extraction uses your backend and the SDK or core package. Your frame-src/frame-ancestors policies must allow the same-origin workspace.

## Errors and troubleshooting

API errors use {"error":"message"}. The status table below describes the Community server and shared engine. Browser UI validation may stop a file before making a request.

| HTTP status | Meaning | Next step |
| --- | --- | --- |
| 400 | Invalid image, JSON, question, or empty readable page text | Check the request shape and OCR text |
| 401 | Missing/incorrect Community service credential | Check PAGESIGNAL_API_KEY |
| 403 | Invalid origin or content type in the shared/Vercel handler | Use JSON and the supported hosting/access path |
| 405 | Unsupported method on an API route | Use GET for status, POST for extraction |
| 413 | Body, rendered image, or query text exceeds limits | Split or reduce the request |
| 429 | Community process already has three active requests | Retry later with bounded backoff |
| 502 | Provider rejected, timed out, or returned incomplete/invalid output | Check billing, model access, scan quality, and provider status |
| 503 | OPENAI_API_KEY is missing | Set it in the server runtime and restart/redeploy |

A provider-side 429 is currently wrapped as a 502 by the shared engine. Status configured: true only means a key exists. OCR startup requires network access to its library and English language data; PDF rendering loads PDF.js from a CDN. An unreadable or password-protected PDF may fail; upload an accessible copy. Retry transient failures carefully because a repeated AI request can incur another provider charge.

## Privacy and deployment

Original uploads and results remain in the browser session in the current UI; there is no durable document library. With AI enabled, rendered page images and OCR text go through your server to OpenAI. Questions send numbered page text and conversation context. Provider requests set store: false; that flag alone does not define the provider's full retention policy. OCR/PDF dependencies and fonts are loaded from third-party CDNs. Apply your own access, retention, and compliance policies for the documents you process.

Keep provider and service keys server-side. The Community runner defaults to shared service credentials and a per-process concurrency cap. Optional account mode and the Vercel handlers use Better Auth sessions, database-backed sign-in rate limits, and atomic AI request quotas. Account database records and counters persist; they do not contain uploaded document contents. Paid managed Cloud plans, durable submission IDs, webhooks, polling, and npm PDF-upload helpers are not implemented. The standalone npm packages do not enforce hosted account allowances; hosted API guards enforce request quotas separately. Paid credits and distributed in-flight concurrency accounting are not implemented. MIT code can be self-hosted; model and hosting usage are separate.

GitHub development → reviewed PR → main → Vercel is the web deployment flow. Package releases use a stable vX.Y.Z GitHub release from main and publish all three packages via the trusted publish.yml workflow. See [release setup](https://github.com/akhi-ninja/page-signal/blob/development/docs/npm-releases.md). Existing npm versions cannot be overwritten; documentation changes on npm require a new package release.

## Community registration and maintainer usage

Open https://www.pagesignal.studio/community to optionally share your organization, use case and integration. Sign in with GitHub first. Your registration is private to the maintainer, and a separate checkbox permits contact about your use case. You can update or withdraw the registration at any time. Package downloads do not require registration, and no npm install telemetry is included.

The private admin view is https://www.pagesignal.studio/admin. Set PAGESIGNAL_ADMIN_GITHUB_IDS to a comma-separated list of trusted numeric GitHub account IDs in the server environment, then redeploy. Access is checked against the signed-in user's linked GitHub account on every admin request, not a browser flag or email address. With an empty allowlist, nobody has admin access. Use the same allowlist only where the corresponding deployment's database should be accessible to those maintainers.

The view lists registered accounts, optional registrations and hosted AI attempts for the last 30 UTC dates, with pagination. Attempts include failures and are not document counts, unique installers or self-hosted usage. The last AI activity shown is limited to this window. There is no historical sign-in-event tracker. Raw provider tokens, sessions and document contents are not returned by this API.

The account-mode Node runner and Vercel expose GET /api/community for your own registration and admin availability, PUT for saving explicit consent, and DELETE for withdrawal. GET /api/community?view=admin&page=1 requires allowlisted admin access. Mutations require the canonical Origin, a verified account session, and an 8 KiB body limit. Rapid duplicate saves are throttled. The small pagesignal_community table is created idempotently on first authorized use; the existing auth and usage migrations must already be complete, and the database role must permit table creation. Shared service-key mode does not expose this account feature.

## Development and license

```sh
npm test
npm run docs:build
npm run docs:check
npm run pack:packages
```

README.md is the source for the static documentation page. scripts/build-docs.mjs renders web/docs.html; update both by running docs:build after editing this README. The OpenAPI file is web/openapi.json and describes the Community HTTP API.

The document-query handler was reconstructed from the earlier deployment behavior and tested with mocked provider responses. Automated tests do not prove real-world extraction accuracy. Verify your own documents and integration before production use.

MIT licensed. Preserve the license and copyright notices when distributing copies. Questions and bug reports: [GitHub issues](https://github.com/akhi-ninja/page-signal/issues).
