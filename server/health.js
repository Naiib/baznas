/**
 * Public database readiness contract. The engine marker is intentionally
 * coarse-grained: it proves the selected adapter without exposing connection
 * strings, hosts, or other diagnostics.
 */
export async function getDatabaseHealth(db, { nodeEnv = process.env.NODE_ENV } = {}) {
  if (!db || typeof db.get !== 'function') {
    throw new Error('Database adapter is unavailable.');
  }

  if (nodeEnv === 'production' && db.isPg !== true) {
    const error = new Error('PostgreSQL wajib tersedia di production.');
    error.code = 'POSTGRES_REQUIRED';
    throw error;
  }

  await db.get('SELECT 1 AS ok');
  return {
    status: 'ready',
    checks: {
      database: 'ready',
      database_engine: db.isPg === true ? 'postgresql' : 'sqlite',
    },
  };
}
