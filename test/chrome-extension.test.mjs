import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateFile, stagedDocument, MAX_BYTES } from '../extensions/chrome/model.mjs';
test('extension stages only bounded supported files without claiming extraction', () => {
  assert.throws(() => validateFile({ type: 'text/html', size: 10 }));
  assert.throws(() => validateFile({ type: 'application/pdf', size: MAX_BYTES + 1 }));
  assert.throws(() => validateFile({ type: 'application/pdf', size: 0 }));
  assert.equal(validateFile({ name: 'x.pdf', type: 'application/pdf', size: MAX_BYTES }).size_bytes, MAX_BYTES);
  const result = stagedDocument(null, 'x'.repeat(21000));
  assert.equal(result.status, 'not_extracted'); assert.equal(result.text.length, 20000); assert.deepEqual(result.fields, []);
});
test('pilot has no host access or network capability', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extensions/chrome/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions, undefined);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.deepEqual(manifest.permissions, ['sidePanel', 'contextMenus', 'storage']);
});
