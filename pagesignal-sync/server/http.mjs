import { createServer } from 'node:http';
import { applyMutation, pull, pullWithCheckpoint } from './store.mjs';

const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

function validMutation(body) {
  return body && typeof body.collection === 'string' && body.collection.length > 0 && body.collection.length <= 128 &&
    typeof body.id === 'string' && body.id.length > 0 && body.id.length <= 256 &&
    !body.collection.includes('\0') && !body.id.includes('\0') && isUuid(body.revision) &&
    (body.expected === null || isUuid(body.expected)) &&
    (body.value === null || (typeof body.value === 'object' && body.value !== null && !Array.isArray(body.value)));
}

export function createSyncServer({ pool, authenticate, origin }) {
  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => {
      res.writeHead(status);
      res.end(data === undefined ? undefined : JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') return send(204);
    try {
      const scope = await authenticate(req.headers.authorization);
      if (!scope) return send(401, { error: 'Unauthorized' });

      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/pull') {
        const cursor = url.searchParams.get('cursor') ?? '0';
        if (!/^\d{1,19}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n) {
          return send(400, { error: 'Invalid checkpoint' });
        }
        if (url.searchParams.get('checkpoint') === '1') {
          const history = url.searchParams.get('history');
          const revision = url.searchParams.get('revision');
          if ((history !== null && !isUuid(history)) || (revision !== null && !isUuid(revision))) {
            return send(400, { error: 'Invalid checkpoint proof' });
          }
          return send(200, await pullWithCheckpoint(pool, scope, cursor, history, revision));
        }
        return send(200, await pull(pool, scope, cursor));
      }
      if (req.method !== 'POST' || url.pathname !== '/push') return send(404, { error: 'Unknown route' });

      const chunks = [];
      let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 64 * 1024) {
          res.setHeader('Connection', 'close');
          return send(413, { error: 'Mutation exceeds 64 KiB' });
        }
        chunks.push(chunk);
      }
      let mutation;
      try {
        mutation = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(400, { error: 'Invalid JSON' });
      }
      if (!validMutation(mutation)) return send(400, { error: 'Invalid mutation' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await applyMutation(client, scope, mutation);
        await client.query('COMMIT');
        return send(200, result);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Sync request failed', error.code ?? error.name);
      return send(500, { error: 'Sync request failed' });
    }
  });
}
