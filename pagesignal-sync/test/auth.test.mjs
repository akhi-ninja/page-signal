import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPair, SignJWT } from 'jose';
import { configureAuthentication, createJwtAuthenticator } from '../server/auth.mjs';
import { createSyncServer } from '../server/http.mjs';
import { demoScope, pull, schema } from '../server/store.mjs';

test('JWT sync isolates owners and tenants on push, conflict, and pull', async (t) => {
  const postgres = new PGlite();
  await postgres.exec(schema);
  t.after(() => postgres.close());
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const issuer = 'https://issuer.example';
  const audience = 'pagesignal-sync';
  const sign = ({ tenant = 'tenant-a', subject = 'alice', aud = audience, expiry = '5m' } = {}) =>
    new SignJWT({ tenant_id: tenant }).setProtectedHeader({ alg: 'RS256' }).setIssuer(issuer)
      .setAudience(aud).setSubject(subject).setExpirationTime(expiry).sign(privateKey);

  const pool = {
    query: (sql, values) => postgres.query(sql, values),
    connect: async () => ({ query: (sql, values) => postgres.query(sql, values), release() {} }),
  };
  const server = createSyncServer({ pool, origin: 'http://localhost:4173',
    authenticate: createJwtAuthenticator({ issuer, audience, keys: publicKey }) });
  server.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const request = (path, token, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const feed = async (token) => (await request('/pull?cursor=0', token)).json();
  const alice = await sign();
  const bob = await sign({ subject: 'bob' });
  const anotherTenant = await sign({ tenant: 'tenant-b' });
  const revision = crypto.randomUUID();
  const edit = { collection: 'items', id: 'same-id', revision, expected: null, value: { owner: 'alice' } };
  assert.equal((await request('/pull', null)).status, 401);
  assert.equal((await request('/push', 'local-demo', edit)).status, 401);
  assert.equal((await request('/pull', await sign({ aud: 'wrong' }))).status, 401);
  assert.equal((await request('/pull', await sign({ expiry: 1 }))).status, 401);
  assert.equal((await request('/pull', await sign({ tenant: '' }))).status, 401);
  assert.deepEqual(await (await request('/push', alice, edit)).json(), { ok: true });
  assert.deepEqual((await feed(bob)).changes, []);
  assert.deepEqual((await feed(anotherTenant)).changes, []);

  const foreignRevision = { ...edit, revision: crypto.randomUUID(), expected: revision };
  assert.deepEqual(await (await request('/push', bob, foreignRevision)).json(), { ok: false, remote: null });
  assert.deepEqual(await (await request('/push', bob, { ...edit, value: { owner: 'bob' } })).json(), { ok: true });
  assert.equal((await feed(await sign())).changes[0].value.owner, 'alice');
  assert.equal((await feed(bob)).changes[0].value.owner, 'bob');
  assert.deepEqual((await feed(anotherTenant)).changes, []);
});

test('demo mode is explicit and legacy demo checkpoints are preserved', async (t) => {
  assert.throws(() => configureAuthentication({ SYNC_TOKEN: 'demo' }), /SYNC_JWT/);
  const auth = configureAuthentication({ SYNC_MODE: 'demo', SYNC_TOKEN: 'demo' });
  assert.equal(await auth('Bearer demo'), demoScope);
  assert.equal(await auth('Bearer unknown'), null);

  const postgres = new PGlite();
  t.after(() => postgres.close());
  await postgres.exec(schema.slice(0, schema.indexOf('CREATE TABLE IF NOT EXISTS sync_scopes')));
  const revision = crypto.randomUUID();
  await postgres.query('UPDATE sync_counter SET cursor = 7');
  await postgres.query("INSERT INTO sync_records VALUES ('items', 'legacy', $1, NULL)", [revision]);
  await postgres.query("INSERT INTO sync_changes VALUES (7, 'items', 'legacy', $1, NULL)", [revision]);
  await postgres.exec(schema);
  await postgres.exec(schema);
  const page = await pull(postgres, demoScope, '0');
  assert.equal(page.cursor, '7');
  assert.deepEqual(page.changes, [{ collection: 'items', id: 'legacy', revision, value: null }]);
  assert.deepEqual((await pull(postgres, 'different-scope', '0')).changes, []);
});
