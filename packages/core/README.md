# @pagesignal/core

MIT-licensed PageSignal Community integration.

[Full documentation](https://page-signal.vercel.app/docs#core-package) · [API reference](https://page-signal.vercel.app/docs#api-extract-one-page) · [GitHub](https://github.com/akhi-ninja/page-signal)

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

## Input, output, and limits

One call takes a rendered base64 JPEG data URL (up to 3,800,000 characters) and OCR text (up to 20,000 characters). Send an empty string when OCR text is unavailable. The server body limit is 4,000,000 bytes. Render each PDF page and orchestrate repeated calls in your application.

The returned page JSON includes document_type, document_title, form_number, form_revision, issuer, classification_status, classification_evidence, page_role, fields, tables, and review_notes. Field values are strings or null; state identifies filled, blank, illegible, checked, or unchecked values. This differs from the web UI document export (schema_version 3.0). Review AI output against the original; accuracy and complete extraction are not guaranteed.

## Errors

PageSignalError.status reports engine HTTP failures. 400: invalid input; 401: incorrect Community service key; 413: payload too large; 429: Community capacity reached; 502: provider failure or timeout; 503: provider credential missing. The engine wraps provider-side rate limits as 502. Retry transient errors with bounded backoff.

## License

MIT. Retain the included license and copyright notices.
