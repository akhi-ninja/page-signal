# @pagesignal/react

Native document workspace. Version 2.0.0 release candidate; not yet published.

## React package

React 18 and 19 native component. Version 1 src/title/height iframe props are removed in version 2. In Next.js, use a client component. Keep adapter and configuration stable; changing them recreates the React workspace and clears its documents.

```sh
npm install @pagesignal/react@2 @pagesignal/sdk@2 react react-dom
```

```jsx
import { PageSignalWorkspace } from '@pagesignal/react';
import { adapter } from './document-adapter.js';
export default function Documents() {
  return <PageSignalWorkspace adapter={adapter} maxFiles={10} concurrency={2}
    onResultsChange={documents => console.log(documents)} />;
}
```
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

See repository docs for other frameworks and backend setup.
