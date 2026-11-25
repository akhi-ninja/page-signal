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
`;

export async function applyMutation(db, mutation) {
  const { collection, id, revision, value, expected } = mutation;
  // Hold the counter row through commit so checkpoint order matches commit order.
  await db.query('SELECT cursor FROM sync_counter FOR UPDATE');
  const receipt = await db.query('SELECT collection, id FROM sync_changes WHERE revision = $1', [revision]);
  if (receipt.rows.length) {
    const previous = receipt.rows[0];
    if (previous.collection !== collection || previous.id !== id) throw new Error('Mutation ID is already in use.');
    return { ok: true };
  }
  const current = await db.query(
    'SELECT collection, id, revision, value FROM sync_records WHERE collection = $1 AND id = $2',
    [collection, id],
  );
  const remote = current.rows[0] ?? null;
  if ((remote?.revision ?? null) !== expected) return { ok: false, remote };
  const values = [collection, id, revision, value === null ? null : JSON.stringify(value)];
  await db.query(`
    INSERT INTO sync_records (collection, id, revision, value) VALUES ($1, $2, $3, $4)
    ON CONFLICT (collection, id) DO UPDATE SET revision = EXCLUDED.revision, value = EXCLUDED.value
  `, values);
  await db.query(`
    WITH next AS (UPDATE sync_counter SET cursor = cursor + 1 RETURNING cursor)
    INSERT INTO sync_changes (cursor, collection, id, revision, value)
    SELECT cursor, $1, $2, $3, $4 FROM next
  `, values);
  return { ok: true };
}

export async function pull(db, cursor) {
  const { rows } = await db.query(`
    SELECT cursor::text, collection, id, revision, value
    FROM sync_changes WHERE cursor > $1 ORDER BY cursor LIMIT 100
  `, [cursor]);
  return {
    cursor: rows.at(-1)?.cursor ?? cursor,
    changes: rows.map(({ cursor: _cursor, ...change }) => change),
  };
}
