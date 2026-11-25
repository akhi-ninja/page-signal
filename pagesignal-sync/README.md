# PageSignal Sync

An experimental open-source TypeScript library for adding offline writes to web apps. Records live in IndexedDB, queries react to changes, and apps can explicitly sync through an HTTP adapter. The inventory example uses the same data layer in React, Angular, and Vue.

## Run the browser examples

From this folder, using Node.js 24:

```sh
npm ci
npm test
npm run build
npm run preview
```

Open [React](http://localhost:4173/demo/react.html), [Angular](http://localhost:4173/demo/angular.html), or [Vue](http://localhost:4173/demo/vue.html). Set Widget to 1. Once the service worker is active, go offline, increment it, and reload. The quantity persists. The built examples preload their app shell so it can reopen offline. The development server is useful for editing examples.

## Run sync against your own PostgreSQL instance

Run `docker compose up --build` in this folder. The sample server binds to localhost, uses its own PostgreSQL volume, and defaults to the sample token `local-demo`. Alternatively, provision a separate PostgreSQL database, set `DATABASE_URL` and `SYNC_TOKEN`, then run `npm run server`. The server creates its own tables on startup. Set `SYNC_ORIGIN` if your demo runs on a different origin. Set `VITE_SYNC_URL` before building to point the demo at a different server.

1. Open the demo in two separate browser profiles. Framework demos in the same profile share the local database.
2. Create a Widget in one profile and select **Sync now**. Use the same token to sync the second profile.
3. Edit the Widget in both profiles. Sync one, then the other. The second profile shows the rejected local value and the server value.
4. Choose **Keep local** to queue that value again, or **Keep server** to dismiss it. Sync again to share the chosen value.

## Use the TypeScript API

The first npm release is planned under the `next` tag. To try the package from source, run `npm pack` here and install the tarball in your app with `npm install /path/to/pagesignal-sync-0.1.0.tgz`.

```ts
import { SyncDatabase, httpTransport } from '@pagesignal/sync';

const db = new SyncDatabase<{ tasks: { title: string; done: boolean } }>('my-app');
const tasks = db.collection('tasks');
const subscription = tasks.watch().subscribe(({ records, conflicts }) => {
  console.log(records, conflicts);
});

await tasks.put('task-1', { title: 'Count inventory', done: false });
await db.sync(httpTransport('http://localhost:8787', () => sessionToken));

// On teardown:
subscription.unsubscribe();
db.close();
```

Use a distinct database name for each local account and remote dataset. The SDK uses browser Web Locks for cross-tab sync, and requires localhost or HTTPS. Use JSON-compatible values. The SDK type-checks collection records in TypeScript. Runtime application schema validation belongs in the app and its backend.

## HTTP protocol

- `POST /push` accepts `{collection, id, value, revision, expected}`. A null value represents a deletion. The UUID revision doubles as the write receipt. The expected revision is null for an unseen record. A stale write returns `{ok: false, remote}` so the client can preserve the intended edit while displaying the latest server record.
- `GET /pull?cursor=0` returns `{cursor, changes}`. Cursors are opaque decimal strings. Pull again with the returned cursor until the server returns an empty page. Keep deletion entries in the feed.
- Both routes accept a bearer token. Use the same protocol to connect the SDK to your own backend.

This is a single-dataset reference deployment for local evaluation. The sample bearer token grants access to every record. Replace it with application authentication and record authorization before exposing it to untrusted clients. The reference server retains the full change log for replay and write receipts. Automatic reconnect sync, log compaction, migrations between deployments, and public npm publication are pending. The package uses the repository’s MIT license.
