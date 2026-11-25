import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { applyMutation, pull, schema } from './store.mjs';

const { DATABASE_URL, SYNC_TOKEN, PORT = '8787', SYNC_ORIGIN = 'http://localhost:4173' } = process.env;
if (!DATABASE_URL || !SYNC_TOKEN) throw new Error('Set DATABASE_URL and SYNC_TOKEN.');
const pool = new pg.Pool({ connectionString: DATABASE_URL });
await pool.query(schema);
const expectedToken = Buffer.from(`Bearer ${SYNC_TOKEN}`);
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

function validMutation(body) {
  return body && typeof body.collection === 'string' && body.collection.length > 0 && body.collection.length <= 128 &&
    typeof body.id === 'string' && body.id.length > 0 && body.id.length <= 256 &&
    !body.collection.includes('\0') && !body.id.includes('\0') && isUuid(body.revision) &&
    (body.expected === null || isUuid(body.expected)) &&
    (body.value === null || (typeof body.value === 'object' && body.value !== null && !Array.isArray(body.value)));
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', SYNC_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => {
    res.writeHead(status);
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  if (req.method === 'OPTIONS') return send(204);
  const token = Buffer.from(req.headers.authorization ?? '');
  if (token.length !== expectedToken.length || !timingSafeEqual(token, expectedToken)) {
    return send(401, { error: 'Unauthorized' });
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/pull') {
      const cursor = url.searchParams.get('cursor') ?? '0';
      if (!/^\d{1,19}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n) {
        return send(400, { error: 'Invalid checkpoint' });
      }
      return send(200, await pull(pool, cursor));
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
      const result = await applyMutation(client, mutation);
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
}).listen(Number(PORT), '0.0.0.0', () => console.log(`PageSignal Sync listening on ${PORT}`));
