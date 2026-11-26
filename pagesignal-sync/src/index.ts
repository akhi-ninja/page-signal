import Dexie, { liveQuery, type Table } from 'dexie';

export type Value = Record<string, unknown>;
export type Change = { collection: string; id: string; revision: string; value: Value | null };
export type Mutation = Change & { expected: string | null };
export type Conflict = { local: Mutation; remote: Change | null };
type CheckpointProof = { history?: string; revision?: string };

export type Transport = {
  checkpointRecovery?: boolean;
  push(mutation: Mutation, signal?: AbortSignal): Promise<{ ok: true } | { ok: false; remote: Change | null }>;
  pull(cursor: string, signal?: AbortSignal, proof?: CheckpointProof): Promise<{ cursor: string; changes: Change[]; history?: string; reset?: boolean }>;
};

export class SyncRequestError extends Error {
  constructor(status: number) {
    super(`Sync request failed (${status})`);
    this.status = status;
  }

  readonly status: number;
}

export type SyncStatus =
  | { state: 'idle' | 'offline' | 'syncing' }
  | { state: 'retrying'; delayMs: number; error: unknown }
  | { state: 'blocked'; error: unknown };

export function httpTransport(url: string, token: () => string): Transport {
  async function request(path: string, signal?: AbortSignal, body?: Mutation) {
    const response = await fetch(new URL(path, url), {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new SyncRequestError(response.status);
    return response.json();
  }
  return {
    checkpointRecovery: true,
    push: (mutation, signal) => request('/push', signal, mutation),
    pull: (cursor, signal, proof) => {
      const query = new URLSearchParams({ cursor, checkpoint: '1' });
      if (proof?.history) query.set('history', proof.history);
      if (proof?.revision) query.set('revision', proof.revision);
      return request(`/pull?${query}`, signal);
    },
  };
}

type Pending = Mutation & { order?: number };
type State = CheckpointProof & { key: string; cursor: string };
type ConflictEntry = Conflict & { collection: string; id: string };

export class SyncDatabase<Schema extends Record<string, Value>> {
  private db: Dexie;
  private remote: Table<Change, [string, string]>;
  private pending: Table<Pending, number>;
  private conflicts: Table<ConflictEntry, [string, string]>;
  private state: Table<State, string>;

  private name: string;
  private stopAutoSync?: () => void;

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
    this.stopAutoSync?.();
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

  startAutoSync(transport: Transport, onStatus: (status: SyncStatus) => void = () => {}) {
    if (this.stopAutoSync) throw new Error('Automatic sync is already running for this database instance.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = false;
    let blocked = false;
    let requested = false;
    let failures = 0;

    const schedule = (delay = 0) => {
      clearTimeout(timer);
      if (controller.signal.aborted || blocked || active) return;
      if (!navigator.onLine) {
        onStatus({ state: 'offline' });
        return;
      }
      timer = setTimeout(() => void run(), delay);
    };

    const run = async () => {
      if (controller.signal.aborted || blocked || active || !navigator.onLine) return;
      active = true;
      requested = false;
      let retryDelay: number | undefined;
      try {
        onStatus({ state: 'syncing' });
        await this.sync(transport, controller.signal);
        failures = 0;
        if (!controller.signal.aborted) onStatus({ state: navigator.onLine ? 'idle' : 'offline' });
      } catch (error) {
        if (controller.signal.aborted) return;
        const transient = error instanceof TypeError ||
          (error instanceof DOMException && error.name === 'TimeoutError') ||
          (error instanceof SyncRequestError && (error.status === 408 || error.status === 429 || error.status >= 500));
        if (transient) {
          const ceiling = Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5));
          retryDelay = Math.round(ceiling * (0.5 + Math.random() * 0.5));
          onStatus(navigator.onLine ? { state: 'retrying', delayMs: retryDelay, error } : { state: 'offline' });
        } else {
          blocked = true;
          onStatus({ state: 'blocked', error });
        }
      } finally {
        active = false;
        if (retryDelay !== undefined || requested) schedule(retryDelay);
      }
    };

    const request = () => {
      requested = true;
      if (failures === 0) schedule();
    };
    const offline = () => {
      clearTimeout(timer);
      if (!blocked) onStatus({ state: 'offline' });
    };
    const online = () => {
      failures = 0;
      request();
    };
    const pending = liveQuery(() => this.pending.orderBy('order').last()).subscribe({
      next: (edit) => { if (edit) request(); },
      error: (error) => {
        blocked = true;
        clearTimeout(timer);
        onStatus({ state: 'blocked', error });
      },
    });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const stop = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      clearTimeout(timer);
      pending.unsubscribe();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      this.stopAutoSync = undefined;
    };
    this.stopAutoSync = stop;
    request();
    return {
      stop,
      retry: () => {
        if (controller.signal.aborted) return;
        blocked = false;
        online();
      },
    };
  }

  sync(transport: Transport, signal?: AbortSignal) {
    return navigator.locks.request(`pagesignal-sync:${this.name}`, { signal }, async () => {
      signal?.throwIfAborted();
      if (transport.checkpointRecovery) await this.pullChanges(transport, signal);

      // Drain the edits present at the start of this pass. Later writes remain queued.
      for (const { order, ...mutation } of await this.pending.toArray()) {
        const key: [string, string] = [mutation.collection, mutation.id];
        if (!(await this.pending.get(order!))) continue;
        signal?.throwIfAborted();
        const result = await transport.push(mutation, signal);
        signal?.throwIfAborted();
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

      await this.pullChanges(transport, signal);
    });
  }

  private async pullChanges(transport: Transport, signal?: AbortSignal) {
    let checkpoint: State = await this.state.get('pull') ?? { key: 'pull', cursor: '0' };
    let restarted = false;
    while (true) {
      signal?.throwIfAborted();
      const page = await transport.pull(checkpoint.cursor, signal, {
        history: checkpoint.history, revision: checkpoint.revision,
      });
      signal?.throwIfAborted();
      if (page.reset || (page.history && page.history !== checkpoint.history)) {
        if (restarted || !page.history) throw new Error('Sync history could not be refreshed.');
        restarted = true;
        checkpoint = { key: 'pull', cursor: '0', history: page.history };
        await this.db.transaction('rw', [this.remote, this.state, this.conflicts], async () => {
          await this.remote.clear();
          await this.conflicts.toCollection().modify({ remote: null });
          await this.state.put(checkpoint);
        });
        continue;
      }

      if (page.changes.length === 0) return;
      if (page.cursor === checkpoint.cursor) throw new Error('Sync checkpoint failed to advance.');
      checkpoint = {
        key: 'pull', cursor: page.cursor, history: page.history,
        revision: page.history ? page.changes.at(-1)?.revision : undefined,
      };
      await this.db.transaction('rw', [this.remote, this.state, this.conflicts], async () => {
        await this.remote.bulkPut(page.changes);
        for (const change of page.changes) {
          await this.conflicts.update([change.collection, change.id], { remote: change });
        }
        await this.state.put(checkpoint);
      });
    }
  }
}
