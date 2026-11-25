import { SyncDatabase, httpTransport } from '../src/index.ts';

type Item = { quantity: number };
const db = new SyncDatabase<{ inventory: Item }>('pagesignal-sync-inventory');
export const inventory = db.collection('inventory');
export const empty: Awaited<ReturnType<typeof inventory.list>> = { records: [], conflicts: [] };

export async function act(operation: () => Promise<unknown>, status: (message: string) => void) {
  try {
    await operation();
    status('Saved');
  } catch (error) {
    status(error instanceof Error ? error.message : String(error));
  }
}

export function add() {
  return inventory.put('Widget', { quantity: 1 });
}

export function sync() {
  const token = window.prompt('Enter the demo server token', sessionStorage.getItem('sync-token') ?? 'local-demo');
  if (token === null) return Promise.resolve();
  sessionStorage.setItem('sync-token', token);
  return db.sync(httpTransport(import.meta.env.VITE_SYNC_URL ?? 'http://localhost:8787', () => token));
}

export function keepLocal(conflict: (typeof empty.conflicts)[number]) {
  return inventory.resolve(conflict.id, conflict.local.value as Item | null);
}

export function describe(conflict: (typeof empty.conflicts)[number]) {
  return `${conflict.id}: local ${JSON.stringify(conflict.local.value)}, server ${JSON.stringify(conflict.remote?.value ?? null)}`;
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('../sw.js').then(() => navigator.serviceWorker.ready)
    .then(() => document.documentElement.dataset.offlineReady = 'true')
    .catch(console.error);
}
