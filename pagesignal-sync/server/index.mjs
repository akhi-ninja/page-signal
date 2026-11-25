import pg from 'pg';
import { configureAuthentication } from './auth.mjs';
import { createSyncServer } from './http.mjs';
import { schema } from './store.mjs';

const { DATABASE_URL, PORT = '8787', HOST = '127.0.0.1', SYNC_ORIGIN = 'http://localhost:4173' } = process.env;
if (!DATABASE_URL) throw new Error('Set DATABASE_URL.');
const authenticate = configureAuthentication(process.env);
const pool = new pg.Pool({ connectionString: DATABASE_URL });
await pool.query(schema);

createSyncServer({ pool, authenticate, origin: SYNC_ORIGIN })
  .listen(Number(PORT), HOST, () => console.log(`PageSignal Sync listening on ${PORT}`));
