export const demoScope = 'demo';

export const schema = `
  CREATE TABLE IF NOT EXISTS sync_counter (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    cursor bigint NOT NULL DEFAULT 0
  );
  INSERT INTO sync_counter (singleton) VALUES (true) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS sync_records (
    collection text NOT NULL,
    id text NOT NULL,
    revision uuid NOT NULL,
    value jsonb,
    PRIMARY KEY (collection, id)
  );
  CREATE TABLE IF NOT EXISTS sync_changes (
    cursor bigint PRIMARY KEY,
    collection text NOT NULL,
    id text NOT NULL,
    revision uuid NOT NULL UNIQUE,
    value jsonb
  );
  CREATE TABLE IF NOT EXISTS sync_scopes (
    scope text PRIMARY KEY,
    cursor bigint NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS scoped_sync_records (
    scope text NOT NULL,
    collection text NOT NULL,
    id text NOT NULL,
    revision uuid NOT NULL,
    value jsonb,
    PRIMARY KEY (scope, collection, id)
  );
  CREATE TABLE IF NOT EXISTS scoped_sync_changes (
    scope text NOT NULL,
    cursor bigint NOT NULL,
    collection text NOT NULL,
    id text NOT NULL,
    revision uuid NOT NULL,
    value jsonb,
    PRIMARY KEY (scope, cursor),
    UNIQUE (scope, revision)
  );
  -- Carry forward existing local demo records, receipts and checkpoints once.
  WITH migrated AS (
    INSERT INTO sync_scopes (scope, cursor)
    SELECT 'demo', cursor FROM sync_counter
    ON CONFLICT DO NOTHING RETURNING scope
  ), copied_records AS (
    INSERT INTO scoped_sync_records (scope, collection, id, revision, value)
    SELECT scope, collection, id, revision, value FROM migrated CROSS JOIN sync_records
  )
  INSERT INTO scoped_sync_changes (scope, cursor, collection, id, revision, value)
  SELECT scope, sync_changes.cursor, collection, id, revision, value
  FROM migrated CROSS JOIN sync_changes;
`;

export async function applyMutation(db, scope, mutation) {
  const { collection, id, revision, value, expected } = mutation;
  // Hold the counter row through commit so checkpoint order matches commit order.
  await db.query('INSERT INTO sync_scopes (scope) VALUES ($1) ON CONFLICT DO NOTHING', [scope]);
  await db.query('SELECT cursor FROM sync_scopes WHERE scope = $1 FOR UPDATE', [scope]);
  const receipt = await db.query('SELECT collection, id FROM scoped_sync_changes WHERE scope = $1 AND revision = $2', [scope, revision]);
  if (receipt.rows.length) {
    const previous = receipt.rows[0];
    if (previous.collection !== collection || previous.id !== id) throw new Error('Mutation ID is already in use.');
    return { ok: true };
  }
  const current = await db.query(
    'SELECT collection, id, revision, value FROM scoped_sync_records WHERE scope = $1 AND collection = $2 AND id = $3',
    [scope, collection, id],
  );
  const remote = current.rows[0] ?? null;
  if ((remote?.revision ?? null) !== expected) return { ok: false, remote };
  const values = [scope, collection, id, revision, value === null ? null : JSON.stringify(value)];
  await db.query(`
    INSERT INTO scoped_sync_records (scope, collection, id, revision, value) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (scope, collection, id) DO UPDATE SET revision = EXCLUDED.revision, value = EXCLUDED.value
  `, values);
  await db.query(`
    WITH next AS (UPDATE sync_scopes SET cursor = cursor + 1 WHERE scope = $1 RETURNING cursor)
    INSERT INTO scoped_sync_changes (scope, cursor, collection, id, revision, value)
    SELECT $1, cursor, $2, $3, $4, $5 FROM next
  `, values);
  return { ok: true };
}

export async function pull(db, scope, cursor) {
  const { rows } = await db.query(`
    SELECT cursor::text, collection, id, revision, value
    FROM scoped_sync_changes WHERE scope = $1 AND cursor > $2 ORDER BY cursor LIMIT 100
  `, [scope, cursor]);
  return {
    cursor: rows.at(-1)?.cursor ?? cursor,
    changes: rows.map(({ cursor: _cursor, ...change }) => change),
  };
}
