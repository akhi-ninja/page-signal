export const usageSchema = `CREATE TABLE IF NOT EXISTS pagesignal_usage (
  subject text NOT NULL,
  day date NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  minute bigint NOT NULL,
  minute_requests integer NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day)
)`;
const reserve = `INSERT INTO pagesignal_usage(subject, day, requests, minute, minute_requests)
  VALUES ($1, $2, 1, $3, 1)
  ON CONFLICT (subject, day) DO UPDATE SET
    requests = pagesignal_usage.requests + 1,
    minute = EXCLUDED.minute,
    minute_requests = CASE WHEN pagesignal_usage.minute = EXCLUDED.minute
      THEN pagesignal_usage.minute_requests + 1 ELSE 1 END
  WHERE pagesignal_usage.requests < $4 AND
    (pagesignal_usage.minute <> EXCLUDED.minute OR pagesignal_usage.minute_requests < $5)
  RETURNING requests`;
export async function reserveAiRequest(pool, userId, limits, now = new Date()) {
  const day = now.toISOString().slice(0, 10), minute = Math.floor(now.getTime() / 60000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const global = await client.query(reserve, ['global', day, minute, limits.globalDaily, limits.globalDaily]);
    if (!global.rows.length) { await client.query('ROLLBACK'); return { allowed: false, reason: 'Service daily AI capacity reached. Try again tomorrow.' }; }
    const user = await client.query(reserve, [`account:${userId}`, day, minute, limits.daily, limits.perMinute]);
    if (!user.rows.length) { await client.query('ROLLBACK'); return { allowed: false, reason: 'Your AI request limit was reached. Wait a minute or try again tomorrow.' }; }
    await client.query('COMMIT');
    return { allowed: true, used: user.rows[0].requests, remaining: Math.max(0, limits.daily - user.rows[0].requests) };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
export async function readUsage(pool, userId, limits) {
  const day = new Date().toISOString().slice(0, 10);
  const result = await pool.query('SELECT requests FROM pagesignal_usage WHERE subject=$1 AND day=$2', [`account:${userId}`, day]);
  const used = result.rows[0]?.requests || 0;
  return { used, remaining: Math.max(0, limits.daily - used), dailyLimit: limits.daily, perMinute: limits.perMinute, unit: 'AI requests', resetsAt: new Date(Date.parse(day) + 86400000).toISOString() };
}
