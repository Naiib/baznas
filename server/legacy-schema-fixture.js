import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const parityFixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migration-parity.test.js');

export async function readLegacySchemaOnlySql() {
  const source = await fs.readFile(parityFixturePath, 'utf8');
  const match = source.match(/const legacyFixtureSql = `([\s\S]*?)`;/);
  if (!match) throw new Error('LEGACY_SCHEMA_FIXTURE_DDL_NOT_FOUND');
  const statements = match[1].split(';').map((statement) => statement.trim()).filter((statement) => /^CREATE\s+(?:TABLE|INDEX)\b/i.test(statement));
  if (!statements.some((statement) => /CREATE TABLE ppd_payments\b/i.test(statement))
    || !statements.some((statement) => /CREATE TABLE recipient_confirmations\b/i.test(statement))) {
    throw new Error('LEGACY_SCHEMA_FIXTURE_INCOMPLETE');
  }
  return `${statements.map((statement) => `${statement};`).join('\n')}\n`;
}
