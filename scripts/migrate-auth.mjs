import { getMigrations } from 'better-auth/db/migration';
import { getAuthRuntime } from '../lib/auth.mjs';
import { usageSchema } from '../lib/usage.mjs';
const runtime = getAuthRuntime(process.env);
if (!runtime) throw new Error('Set DATABASE_URL, BETTER_AUTH_URL and BETTER_AUTH_SECRET (32+ characters) before migrating.');
try {
  const { runMigrations } = await getMigrations(runtime.auth.options);
  await runMigrations();
  await runtime.pool.query(usageSchema);
  console.log('Authentication and AI usage tables are ready.');
} finally { await runtime.pool.end(); }
