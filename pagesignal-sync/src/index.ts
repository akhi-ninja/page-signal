import Dexie, { liveQuery, type Table } from 'dexie';

export type Value = Record<string, unknown>;
export type Change = { collection: string; id: string; revision: string; value: Value | null };
export type Mutation = Change & { expected: string | null };
export type Conflict = { local: Mutation; remote: Change | null };
export type Transport = {
  push(mutation: Mutation): Promise<{ ok: true } | { ok: false; remote: Change | null }>;
  pull(cursor: string): Promise<{ cursor: string; changes: Change[] }>;
};

export function httpTransport(url: string, token: () => string): Transport {
  async function request(path: string, body?: Mutation) {
    const response = await fetch(new URL(path, url), {
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Sync request failed (${response.status})`);
    return response.json();
  }
  return {
    push: (mutation) => request('/push', mutation),
    pull: (cursor) => request(`/pull?cursor=${encodeURIComponent(cursor)}`),
  };
}

type Pending = Mutation & { order?: number };
type State = { key: string; cursor: string };
type ConflictEntry = Conflict & { collection: string; id: string };

export class SyncDatabase<Schema extends Record<string, Value>> {
  private db: Dexie;
  private remote: Table<Change, [string, string]>;
  private pending: Table<Pending, number>;
  private conflicts: Table<ConflictEntry, [string, string]>;
  private state: Table<State, string>;

  private name: string;

  constructor(name: string) {
    this.name = name;
    this.db = new Dexie(name);
    this.db.version(1).stores({
      remote: '[collection+id],collection',
      pending: '++order,[collection+id],collection',
      conflicts: '[collection+id],collection',
      state: 'key',
    });
    this.remote = this.db.table('remote');
    this.pending = this.db.table('pending');
    this.conflicts = this.db.table('conflicts');
    this.state = this.db.table('state');
  }

  close() {
    this.db.close();
  }

  collection<Key extends keyof Schema & string>(collection: Key) {
    const list = () => this.db.transaction('r', [this.remote, this.pending, this.conflicts], async () => {
      const records = new Map<string, Value | null>();
      for (const record of await this.remote.where('collection').equals(collection).toArray()) {
        records.set(record.id, record.value);
      }
      for (const edit of await this.pending.where('collection').equals(collection).sortBy('order')) {
        records.set(edit.id, edit.value);
      }
      const conflicts = await this.conflicts.where('collection').equals(collection).toArray();
      return {
        records: [...records].flatMap(([id, value]) => value === null ? [] : [{ id, value: value as Schema[Key] }]),
        conflicts,
      };
    });
    return {
      list,
      watch: () => liveQuery(list),
      put: (id: string, value: Schema[Key]) => this.write(collection, id, value),
      remove: (id: string) => this.write(collection, id, null),
      resolve: (id: string, value?: Schema[Key] | null) => this.db.transaction(
        'rw', [this.remote, this.pending, this.conflicts], async () => {
          if (!(await this.conflicts.get([collection, id]))) return;
          await this.conflicts.delete([collection, id]);
          if (value !== undefined) await this.write(collection, id, value);
        },
      ),
    };
  }

  private write(collection: string, id: string, value: Value | null) {
    if (!collection || !id || collection.length > 128 || id.length > 256) {
      throw new Error('Collection and record identifiers must be nonempty and within server limits.');
    }
    return this.db.transaction('rw', [this.remote, this.pending, this.conflicts], async () => {
      const key: [string, string] = [collection, id];
      if (await this.conflicts.get(key)) throw new Error('Resolve the conflict before editing this record.');
      const edits = await this.pending.where('[collection+id]').equals(key).sortBy('order');
      const base = edits.at(-1) ?? await this.remote.get(key);
      await this.pending.add({ collection, id, value, revision: crypto.randomUUID(), expected: base?.revision ?? null });
    });
  }

  sync(transport: Transport) {
    return navigator.locks.request(`pagesignal-sync:${this.name}`, async () => {
      // Drain the edits present at the start of this pass. Later writes remain queued.
      for (const { order, ...mutation } of await this.pending.toArray()) {
        const key: [string, string] = [mutation.collection, mutation.id];
        if (!(await this.pending.get(order!))) continue;
        const result = await transport.push(mutation);
        await this.db.transaction('rw', [this.remote, this.pending, this.conflicts], async () => {
          if (result.ok) {
            await this.remote.put({ collection: mutation.collection, id: mutation.id, revision: mutation.revision, value: mutation.value });
            await this.pending.delete(order!);
          } else {
            const edits = this.pending.where('[collection+id]').equals(key);
            const latest = (await edits.sortBy('order')).at(-1)!;
            const { order: _order, ...local } = latest;
            await this.conflicts.put({ collection: mutation.collection, id: mutation.id, local, remote: result.remote });
            if (result.remote) await this.remote.put(result.remote);
            else await this.remote.delete(key);
            await edits.delete();
          }
        });
      }

      let cursor = (await this.state.get('pull'))?.cursor ?? '0';
      while (true) {
        const page = await transport.pull(cursor);
        if (page.changes.length === 0) return;
        if (page.cursor === cursor) throw new Error('Sync checkpoint failed to advance.');
        await this.db.transaction('rw', [this.remote, this.state], async () => {
          await this.remote.bulkPut(page.changes);
          await this.state.put({ key: 'pull', cursor: page.cursor });
        });
        cursor = page.cursor;
      }
    });
  }
}
