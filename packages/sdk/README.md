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

The constructor also accepts fetch for a custom transport. baseUrl is reduced to its origin, so path prefixes are not supported. It rejects embedded URL credentials and redirects. The default timeout is 120,000 ms. Service errors expose error.status; cancellation/network errors may not. SDK extractPage processes one JPEG page, not a PDF file. Use raw HTTP for document_query; a query convenience method is not yet exported. Keep the SDK and service key on your server.

## Input, output, and limits

One call takes a rendered base64 JPEG data URL (up to 3,800,000 characters) and OCR text (up to 20,000 characters). Send an empty string when OCR text is unavailable. The server body limit is 4,000,000 bytes. Render each PDF page and orchestrate repeated calls in your application.

The returned page JSON includes document_type, document_title, form_number, form_revision, issuer, classification_status, classification_evidence, page_role, fields, tables, and review_notes. Field values are strings or null; state identifies filled, blank, illegible, checked, or unchecked values. This differs from the web UI document export (schema_version 3.0). Review AI output against the original; accuracy and complete extraction are not guaranteed.

## Errors

Service errors expose error.status; cancellation/network errors may not. 400: invalid input; 401: incorrect Community service key; 413: payload too large; 429: Community capacity reached; 502: provider failure or timeout; 503: provider credential missing. The engine wraps provider-side rate limits as 502. Retry transient errors with bounded backoff.

## License

MIT. Retain the included license and copyright notices.
