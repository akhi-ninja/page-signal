# @pagesignal/core

MIT-licensed PageSignal Community integration.

[Full documentation](https://www.pagesignal.studio/docs#core-package) · [API reference](https://www.pagesignal.studio/docs#api-extract-one-page) · [GitHub](https://github.com/akhi-ninja/page-signal)

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

extractPage({ image, text = '' }, { apiKey, model }) returns a page response. Optional model overrides the default. HTTP failures expose PageSignalError.status. PDF rendering, OCR, authentication, storage, billing, and multi-page orchestration belong to your application. Use queryDocument for specific fields or document questions. Never put OPENAI_API_KEY in browser code.


## Specific fields and document chat

```js
import { queryDocument } from '@pagesignal/core';

const result = await queryDocument({
  pages: [{page: 1, text: 'Policy number: P-1042. Renewal date: 12/01/2026.'}],
  question: 'Find policy number and renewal date',
  mode: 'fields'
}, {apiKey: process.env.OPENAI_API_KEY});
console.log(result.fields);
```

Use `mode: 'fields'` for key/value extraction or `mode: 'chat'` for a follow-up answer. Resend numbered page text for each request; there is no stored document ID. Optional `context` is a string of prior conversation (up to 6,000 characters). Questions are limited to 2,000 characters and page text to 160,000 characters across 1–40 unique pages. These queries read text, not original images. Unreadable or unsupported values may be null; run vision extraction first when scans need it. Responses include `answer`, page `citations`, and atomic `fields` with source evidence. Citations and values still need human review.

## Input, output, and limits

One call takes a rendered base64 JPEG data URL (up to 3,800,000 characters) and OCR text (up to 20,000 characters). Send an empty string when OCR text is unavailable. The server body limit is 4,000,000 bytes. Render each PDF page and orchestrate repeated calls in your application.

The returned page JSON includes document_type, document_title, form_number, form_revision, issuer, classification_status, classification_evidence, page_role, fields, tables, and review_notes. Field values are strings or null; state identifies filled, blank, illegible, checked, or unchecked values. This differs from the web UI document export (schema_version 3.0). Review AI output against the original; accuracy and complete extraction are not guaranteed.

## Errors

PageSignalError.status reports engine HTTP failures. 400: invalid input; 401: incorrect Community service key; 413: payload too large; 429: Community capacity reached; 502: provider failure or timeout; 503: provider credential missing. The engine wraps provider-side rate limits as 502. Retry transient errors with bounded backoff.

## License

MIT. Retain the included license and copyright notices.

## Version 1.1.1

Includes updated any-document identification and evidence-grounded field queries. Full workspace features (multi-upload, source preview/highlighting, sign-in, optional community registration and maintainer analytics) are in the GitHub source application, not bundled into this server library.

## Guides

[PDF and scanned document to JSON workflow](https://www.pagesignal.studio/guides/pdf-to-json) · [Package and backend integration guide](https://www.pagesignal.studio/integrations)
