import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { SyncDatabase } from '../src/index.ts';
import { applyMutation, demoScope, pull, schema } from '../server/store.mjs';

Object.defineProperty(navigator, 'locks', {
  value: { request: (_name, run) => run() },
});

test('offline reload, retry, conflict recovery, and tombstones across clients', async (t) => {
  const postgres = new PGlite();
  await postgres.exec(schema);
  t.after(() => postgres.close());
  const transport = {
    push: (mutation) => postgres.transaction((tx) => applyMutation(tx, demoScope, mutation)),
    pull: (cursor) => pull(postgres, demoScope, cursor),
  };
  const open = (name) => {
    const db = new SyncDatabase(name);
    t.after(() => db.close());
    return db;
  };
  const first = open('first');
  await first.collection('items').put('x', { quantity: 1 });
  first.close();
  const left = open('first');
  const right = open('second');
  const local = left.collection('items');
  const remote = right.collection('items');
  const quantity = async (collection) => (await collection.list()).records[0]?.value.quantity;
  assert.equal(await quantity(local), 1);

  await assert.rejects(left.sync({
    ...transport,
    push: async (mutation) => {
      await transport.push(mutation);
      throw new Error('response lost after commit');
    },
  }), /response lost/);
  await left.sync(transport);
  assert.equal((await transport.pull('0')).changes.length, 1);
  await right.sync(transport);
  assert.equal(await quantity(remote), 1);

  await local.put('x', { quantity: 2 });
  await local.put('x', { quantity: 3 });
  await remote.put('x', { quantity: 4 });
  await right.sync(transport);
  await left.sync(transport);
  const { conflicts } = await local.list();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].local.value.quantity, 3);
  assert.equal(conflicts[0].remote.value.quantity, 4);
  assert.equal(await quantity(local), 4);
  await local.resolve('x', conflicts[0].local.value);
  await left.sync(transport);
  await right.sync(transport);
  assert.equal(await quantity(remote), 3);
  assert.deepEqual((await local.list()).conflicts, []);

  await remote.remove('x');
  await right.sync(transport);
  await left.sync(transport);
  assert.equal(await quantity(local), undefined);
  assert.equal((await transport.pull('0')).changes.at(-1).value, null);
});

test('writes made during a push remain queued for the next pass', async (t) => {
  const db = new SyncDatabase('during-push');
  t.after(() => db.close());
  const notes = db.collection('notes');
  let unblock;
  let start;
  const started = new Promise((resolve) => { start = resolve; });
  const gate = new Promise((resolve) => { unblock = resolve; });
  const sent = [];
  const transport = {
    push: async (mutation) => {
      sent.push(mutation);
      if (sent.length === 1) {
        start();
        await gate;
      }
      return { ok: true };
    },
    pull: async (cursor) => ({ cursor, changes: [] }),
  };
  await notes.put('a', { text: 'first' });
  const sync = db.sync(transport);
  await started;
  try {
    await notes.put('a', { text: 'second' });
  } finally {
    unblock();
  }
  await sync;
  assert.equal((await notes.list()).records[0].value.text, 'second');
  assert.equal(sent.length, 1);
  await db.sync(transport);
  assert.equal(sent[1].expected, sent[0].revision);
});
