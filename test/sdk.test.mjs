import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PageSignalClient } from '../packages/sdk/index.mjs';
import { extractPage } from '../packages/core/index.mjs';

test('SDK sends credential to intended server and returns extraction', async () => {
  const client = new PageSignalClient({
    baseUrl: 'https://selfhost.example',
    apiKey: 'service-test',
    fetch: async (url, init) => {
      assert.equal(url, 'https://selfhost.example/api/ai/extract');
      assert.equal(init.headers.Authorization, 'Bearer service-test');
      assert.equal(init.redirect, 'error');
      assert.equal(JSON.parse(init.body).text, 'invoice');
      return Response.json({ document_type: 'invoice' });
    }
  });
  assert.equal((await client.extractPage({ image: 'data:image/jpeg;base64,AA==', text: 'invoice' })).document_type, 'invoice');
});
test('SDK propagates service rejection', async () => {
  const client = new PageSignalClient({ baseUrl: 'http://localhost:3000', apiKey: 'test',
    fetch: async () => Response.json({ error: 'Capacity reached' }, { status: 429 }) });
  await assert.rejects(client.extractPage({ image: 'test' }), { status: 429 });
});
test('core rejects missing credential before processing', async () => {
  await assert.rejects(extractPage({ image: 'test' }), { status: 503 });
});
