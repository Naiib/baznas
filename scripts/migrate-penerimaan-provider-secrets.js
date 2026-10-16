#!/usr/bin/env node
/**
 * BAZNAS Data Center - Migration Script for Penerimaan Provider Secrets
 * Encrypts legacy plaintext provider webhook secrets into AES-256-GCM versioned envelopes.
 * Supports --dry-run to inspect counts without modifying database.
 * Never prints secret values.
 *
 * Usage:
 *   node scripts/migrate-penerimaan-provider-secrets.js
 *   node scripts/migrate-penerimaan-provider-secrets.js --dry-run
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getDb, initDb, withTransaction } from '../server/db.js';
import {
  getProviderSecretEncryptionKey,
  encryptProviderSecret,
} from '../server/penerimaan-provider-secrets.js';

export async function runProviderSecretsMigration({ dryRun = false, dbOverride = null } = {}) {
  const db = dbOverride || (await getDb());
  getProviderSecretEncryptionKey();

  const rows = await db.all(
    `SELECT id, provider_name, webhook_secret_encrypted
     FROM penerimaan_provider_configs
     WHERE webhook_secret_encrypted IS NOT NULL
       AND webhook_secret_encrypted != ''`
  );

  const plaintextRows = rows.filter((r) => {
    const sec = String(r.webhook_secret_encrypted || '').trim();
    return sec && !sec.startsWith('v1:');
  });

  if (dryRun) {
    return {
      dryRun: true,
      totalFound: plaintextRows.length,
      migratedCount: 0,
      providers: plaintextRows.map((r) => r.provider_name),
    };
  }

  if (plaintextRows.length === 0) {
    return {
      dryRun: false,
      totalFound: 0,
      migratedCount: 0,
      providers: [],
    };
  }

  return withTransaction(dbOverride, async (txDb) => {
    let migratedCount = 0;
    const now = new Date().toISOString();
    for (const row of plaintextRows) {
      const sec = String(row.webhook_secret_encrypted).trim();
      const encrypted = encryptProviderSecret(sec);
      await txDb.run(
        `UPDATE penerimaan_provider_configs
         SET webhook_secret_encrypted = $1, updated_at = $2
         WHERE id = $3`,
        [encrypted, now, row.id]
      );
      migratedCount++;
    }

    return {
      dryRun: false,
      totalFound: plaintextRows.length,
      migratedCount,
      providers: plaintextRows.map((r) => r.provider_name),
    };
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || args.includes('-n');

  try {
    await initDb();
    const result = await runProviderSecretsMigration({ dryRun: isDryRun });
    if (result.dryRun) {
      console.log(`[DRY RUN] Ditemukan ${result.totalFound} secret provider plaintext yang perlu dimigrasi.`);
      if (result.providers.length > 0) {
        console.log(`Provider terdampak: ${result.providers.join(', ')}`);
      }
      console.log(`Tidak ada perubahan data yang dilakukan.`);
    } else {
      console.log(`[MIGRATION SUCCESS] Berhasil memigrasi ${result.migratedCount} secret provider ke envelope terenkripsi.`);
      if (result.providers.length > 0) {
        console.log(`Provider termigrasi: ${result.providers.join(', ')}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(`[MIGRATION ERROR] Gagal menjalankan migrasi secret provider: ${err.message}`);
    process.exit(1);
  }
}
