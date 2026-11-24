import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateFile, MAX_BYTES } from '../extensions/chrome/model.mjs';
import { accountExtract } from '../lib/account-api.mjs';

test('the panel accepts bounded PDF and image inputs', () => {
  assert.throws(() => validateFile({ type: 'text/html', size: 10 }));
  assert.throws(() => validateFile({ type: 'application/pdf', size: MAX_BYTES + 1 }));
  assert.throws(() => validateFile({ type: 'application/pdf', size: 0 }));
  assert.equal(validateFile({ name: 'x.pdf', type: 'application/pdf', size: MAX_BYTES }).size_bytes, MAX_BYTES);
});

test('manifest grants network access only to PageSignal', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extensions/chrome/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['https://www.pagesignal.studio/*']);
  assert.deepEqual(manifest.permissions, ['sidePanel', 'contextMenus', 'storage']);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'self' https:\/\/www\.pagesignal\.studio$/);
});

test('extraction only accepts the configured extension and still checks session and quota', async () => {
  const site = 'https://www.pagesignal.studio';
  const extension = 'chrome-extension://' + 'a'.repeat(32);
  const otherExtension = 'chrome-extension://' + 'b'.repeat(32);
  const env = { OPENAI_API_KEY: 'mock', PAGESIGNAL_CHROME_EXTENSION_ORIGIN: extension };
  let session = null;
  let remaining = 1;
  const dependencies = {
    getRuntime: () => ({ origin: site, auth: { api: { getSession: async () => session } } }),
    reserve: async () => remaining-- > 0 ? { allowed: true, remaining } : { allowed: false },
    extract: async () => Response.json({ fields: [] }),
  };
  const extract = (origin, config = env) => accountExtract(new Request(site + '/api/ai/extract', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'data:image/jpeg;base64,AA==', text: '' }),
  }), config, dependencies);

  assert.equal((await extract(otherExtension)).status, 403);
  assert.equal((await extract(extension, { OPENAI_API_KEY: 'mock' })).status, 403);
  assert.equal((await extract(extension)).status, 401);
  session = { user: { id: 'user', emailVerified: true } };
  assert.equal((await extract(extension)).status, 200);
  assert.equal((await extract(site)).status, 429);
});
