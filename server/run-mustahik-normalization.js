import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrateMustahikNormalization } from './mustahik-normalization.js';

export function resolveNormalizationTarget(env = process.env, argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const backupIndex = argv.indexOf('--backup-path');
  const backupPath = backupIndex >= 0 ? argv[backupIndex + 1] : null;
  if (!args.has('--apply')) throw new Error('NORMALIZATION_REQUIRES_EXPLICIT_--apply');
  if (!backupPath || !path.isAbsolute(backupPath)) throw new Error('NORMALIZATION_REQUIRES_ABSOLUTE_--backup-path');
  const rawUrl = env.MKA141_TEST_DATABASE_URL;
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('NORMALIZATION_REQUIRES_MKA141_TEST_DATABASE_URL'); }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/_test$/i.test(database)) {
    throw new Error('NORMALIZATION_ONLY_RUNS_ON_POSTGRES_TEST_DATABASES_ENDING_IN__test');
  }
  return { connectionString: rawUrl, backupPath };
}

async function main() {
  const target = resolveNormalizationTarget();
  // Set the validated explicit test URL only after the fail-closed guard.
  process.env.DATABASE_URL = target.connectionString;
  const { getDb } = await import('./db.js');
  const db = await getDb();
  try {
    const result = await migrateMustahikNormalization({ db, backupPath: target.backupPath });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.pool?.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
