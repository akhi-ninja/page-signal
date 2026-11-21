# @pagesignal/sdk

MIT-licensed PageSignal Community integration.

[Full documentation](https://www.pagesignal.studio/docs#sdk-package) · [API reference](https://www.pagesignal.studio/docs#api-extract-one-page) · [GitHub](https://github.com/akhi-ninja/page-signal)

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

The constructor also accepts fetch for a custom transport. baseUrl is reduced to its origin, so path prefixes are not supported. It rejects embedded URL credentials and redirects. The default timeout is 120,000 ms. Service errors expose error.status; cancellation/network errors may not. SDK extractPage processes one JPEG page, not a PDF file. Use client.queryDocument for specific fields or document questions. Keep the SDK and service key on your server.


## Specific fields and document chat

```js
const result = await client.queryDocument({
  pages: [{page: 1, text: 'Policy number: P-1042. Renewal date: 12/01/2026.'}],
  question: 'Find policy number and renewal date',
  mode: 'fields',
  context: ''
}, {signal: AbortSignal.timeout(60000)});
console.log(result.fields);
```

Use `mode: 'fields'` for key/value extraction or `mode: 'chat'` for a follow-up answer. Resend numbered page text for each request; there is no stored document ID. Optional `context` is a string of prior conversation (up to 6,000 characters). Questions are limited to 2,000 characters and page text to 160,000 characters across 1–40 unique pages. These queries read text, not original images. Unreadable or unsupported values may be null; run vision extraction first when scans need it. Responses include `answer`, page `citations`, and atomic `fields` with source evidence. Citations and values still need human review.

## Input, output, and limits

One call takes a rendered base64 JPEG data URL (up to 3,800,000 characters) and OCR text (up to 20,000 characters). Send an empty string when OCR text is unavailable. The server body limit is 4,000,000 bytes. Render each PDF page and orchestrate repeated calls in your application.

The returned page JSON includes document_type, document_title, form_number, form_revision, issuer, classification_status, classification_evidence, page_role, fields, tables, and review_notes. Field values are strings or null; state identifies filled, blank, illegible, checked, or unchecked values. This differs from the web UI document export (schema_version 3.0). Review AI output against the original; accuracy and complete extraction are not guaranteed.

## Errors

Service errors expose error.status; cancellation/network errors may not. 400: invalid input; 401: incorrect Community service key; 413: payload too large; 429: Community capacity reached; 502: provider failure or timeout; 503: provider credential missing. The engine wraps provider-side rate limits as 502. Retry transient errors with bounded backoff.

## License

MIT. Retain the included license and copyright notices.

## Version 1.1.1

Includes updated any-document identification and evidence-grounded field queries. Full workspace features (multi-upload, source preview/highlighting, sign-in, optional community registration and maintainer analytics) are in the GitHub source application, not bundled into this server library.

## Native workspace integration

Version 2 replaces the React iframe API and adds native Angular and Vue components. There is no iframe and no dependency on the hosted PageSignal website. Each framework renders its own DOM. Upload validation, queue state, bounded parallel extraction, cancellation, editable fields, queries and JSON export are shared through the browser-safe `@pagesignal/sdk/workspace` entry point.

The packages provide multiple upload/drag-and-drop, per-document status and errors, cancel/retry/remove, fields on the left, PDF/image preview on the right, field source text, query responses and JSON download. They do not bundle account login, admin pages, OCR, PDF rasterization, a provider key, or a backend. Native PDF preview uses the browser's PDF object viewer with an open-file fallback. Precise source overlays, page-level preview controls and OCR progress are features of the full web app, not these initial native components.

Pass an adapter with `extract({file, signal})` and optional `query({file, result, question, mode, signal})` async functions. Extraction returns an object with optional `fields: [{label, value, source: {page, excerpt}}]`; additional classification/text/table properties are retained and exported. Query returns your application's structured result. Field edits are marked `edited: true`; edits from text inputs are strings. The query result is exported separately from extraction. Removing a document or unmounting aborts outstanding work and revokes local preview URLs. Adapters must honor AbortSignal to stop upstream work.

Defaults: 10 files retained, 30 MiB per file, 100 MiB across retained files, and 2 concurrent extractions. Accepted types: PDF, PNG, JPEG, WebP and BMP. SDK controller options expose all limits; components expose maxFiles and concurrency. These are UI limits; enforce file/page/size limits and authentication again on the server. A PDF page limit requires PDF parsing in your adapter.

A host-owned backend adapter can look like this:

```js
// Browser module. No OpenAI or PageSignal service keys here.
export const adapter = {
  async extract({file, signal}) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/documents/extract', {
      method: 'POST', body: form, signal, credentials: 'same-origin'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Extraction failed');
    return result;
  },
  async query({result, question, mode, signal}) {
    const response = await fetch('/api/documents/query', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({result, question, mode})
    });
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.error || 'Query failed');
    return answer;
  }
};
```

The two /api/documents routes above are examples you implement in your application; they are not new endpoints in the Community server. Your extraction route validates the upload, renders PDF pages or converts images to JPEG, obtains OCR text if needed, and calls server-side core.extractPage or SDK.extractPage for each page. Preserve numbered page text for core.queryDocument or SDK.queryDocument in the query route. Authenticate and authorize both routes, bound concurrent requests and costs, and do not trust client-supplied extraction results for permissions or source verification. Alternatively implement the adapter with your own existing document service.

No data is sent anywhere until your adapter runs. Do not import the SDK root client into browser code with a service key. Browser applications should import only the workspace entry point, or just a framework component. AI results require review against the source.


## Guides

[PDF and scanned document to JSON workflow](https://www.pagesignal.studio/guides/pdf-to-json) · [Package and backend integration guide](https://www.pagesignal.studio/integrations)
