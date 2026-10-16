import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb, initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sqliteDbPath = path.resolve(__dirname, 'baznas_demo.db');

async function getSqliteDb() {
  return open({
    filename: sqliteDbPath,
    driver: sqlite3.Database,
  });
}

export async function migrateSqliteToPg() {
  console.log('====================================================');
  console.log('🔄 BAZNAS Data Migration: SQLite -> PostgreSQL');
  console.log(`📁 Source SQLite Database: ${sqliteDbPath}`);
  console.log('====================================================\n');

  let sqliteDb;
  try {
    sqliteDb = await getSqliteDb();
  } catch (err) {
    console.error('❌ Failed to open SQLite database:', err.message);
    process.exit(1);
  }

  console.log('🛠️  Ensuring PostgreSQL tables are initialized...');
  const pgDb = await initDb();
  console.log('✅ PostgreSQL schema verified.\n');

  const stats = {
    mustahik: 0,
    applications: 0,
    assessments: 0,
    mpzis: 0,
    ppd: 0,
    documents: 0,
    wa_logs: 0,
    bot_sessions: 0,
  };

  try {
    // 1. Migrate Mustahik
    console.log('📦 Migrating table: mustahik...');
    const mustahikRows = await sqliteDb.all('SELECT * FROM mustahik ORDER BY id ASC');
    for (const row of mustahikRows) {
      const keys = Object.keys(row);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map((k) => row[k]);

      const updateSet = keys
        .filter((k) => k !== 'id')
        .map((k) => `${k} = EXCLUDED.${k}`)
        .join(', ');

      const query = `
        INSERT INTO mustahik (${cols})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateSet}
      `;
      await pgDb.run(query, values);
      stats.mustahik++;
    }
    console.log(`   └─ Migrated ${stats.mustahik} mustahik records.`);

    // 2. Migrate Applications
    console.log('📦 Migrating table: applications...');
    const appRows = await sqliteDb.all('SELECT * FROM applications ORDER BY id ASC');
    for (const row of appRows) {
      const keys = Object.keys(row);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map((k) => row[k]);

      const updateSet = keys
        .filter((k) => k !== 'id')
        .map((k) => `${k} = EXCLUDED.${k}`)
        .join(', ');

      const query = `
        INSERT INTO applications (${cols})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateSet}
      `;
      await pgDb.run(query, values);
      stats.applications++;
    }
    console.log(`   └─ Migrated ${stats.applications} applications records.`);

    // 3. Migrate Assessments
    console.log('📦 Migrating table: assessments...');
    const assessmentRows = await sqliteDb.all('SELECT * FROM assessments ORDER BY id ASC');
    for (const row of assessmentRows) {
      const keys = Object.keys(row);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map((k) => row[k]);

      const updateSet = keys
        .filter((k) => k !== 'id')
        .map((k) => `${k} = EXCLUDED.${k}`)
        .join(', ');

      const query = `
        INSERT INTO assessments (${cols})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateSet}
      `;
      await pgDb.run(query, values);
      stats.assessments++;
    }
    console.log(`   └─ Migrated ${stats.assessments} assessments records.`);

    // 4. Migrate MPZIS
    console.log('📦 Migrating table: mpzis...');
    try {
      const mpzisRows = await sqliteDb.all('SELECT * FROM mpzis ORDER BY id ASC');
      for (const row of mpzisRows) {
        const keys = Object.keys(row);
        const cols = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);

        const updateSet = keys
          .filter((k) => k !== 'id')
          .map((k) => `${k} = EXCLUDED.${k}`)
          .join(', ');

        const query = `
          INSERT INTO mpzis (${cols})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSet}
        `;
        await pgDb.run(query, values);
        stats.mpzis++;
      }
      console.log(`   └─ Migrated ${stats.mpzis} mpzis records.`);
    } catch (e) {
      console.log(`   └─ mpzis table notice: ${e.message}`);
    }

    // 5. Migrate PPD
    console.log('📦 Migrating table: ppd...');
    try {
      const ppdRows = await sqliteDb.all('SELECT * FROM ppd ORDER BY id ASC');
      for (const row of ppdRows) {
        const keys = Object.keys(row);
        const cols = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);

        const updateSet = keys
          .filter((k) => k !== 'id')
          .map((k) => `${k} = EXCLUDED.${k}`)
          .join(', ');

        const query = `
          INSERT INTO ppd (${cols})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSet}
        `;
        await pgDb.run(query, values);
        stats.ppd++;
      }
      console.log(`   └─ Migrated ${stats.ppd} ppd records.`);
    } catch (e) {
      console.log(`   └─ ppd table notice: ${e.message}`);
    }

    // 6. Migrate Documents
    console.log('📦 Migrating table: documents...');
    try {
      const docRows = await sqliteDb.all('SELECT * FROM documents ORDER BY id ASC');
      for (const row of docRows) {
        const keys = Object.keys(row);
        const cols = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);

        const updateSet = keys
          .filter((k) => k !== 'id')
          .map((k) => `${k} = EXCLUDED.${k}`)
          .join(', ');

        const query = `
          INSERT INTO documents (${cols})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSet}
        `;
        await pgDb.run(query, values);
        stats.documents++;
      }
      console.log(`   └─ Migrated ${stats.documents} documents records.`);
    } catch (e) {
      console.log(`   └─ documents table notice: ${e.message}`);
    }

    // 7. Migrate WA Logs
    console.log('📦 Migrating table: wa_logs...');
    try {
      const waRows = await sqliteDb.all('SELECT * FROM wa_logs ORDER BY id ASC');
      for (const row of waRows) {
        const keys = Object.keys(row);
        const cols = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);

        const updateSet = keys
          .filter((k) => k !== 'id')
          .map((k) => `${k} = EXCLUDED.${k}`)
          .join(', ');

        const query = `
          INSERT INTO wa_logs (${cols})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateSet}
        `;
        await pgDb.run(query, values);
        stats.wa_logs++;
      }
      console.log(`   └─ Migrated ${stats.wa_logs} wa_logs records.`);
    } catch (e) {
      console.log(`   └─ wa_logs table notice: ${e.message}`);
    }

    // 8. Migrate Bot Sessions
    console.log('📦 Migrating table: bot_sessions...');
    try {
      const botRows = await sqliteDb.all('SELECT * FROM bot_sessions ORDER BY chat_id ASC');
      for (const row of botRows) {
        const keys = Object.keys(row);
        const cols = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);

        const query = `
          INSERT INTO bot_sessions (${cols})
          VALUES (${placeholders})
          ON CONFLICT (chat_id) DO UPDATE SET
            state = EXCLUDED.state,
            temp_data = EXCLUDED.temp_data,
            updated_at = EXCLUDED.updated_at
        `;
        await pgDb.run(query, values);
        stats.bot_sessions++;
      }
      console.log(`   └─ Migrated ${stats.bot_sessions} bot_sessions records.`);
    } catch (e) {
      console.log(`   └─ bot_sessions table notice: ${e.message}`);
    }

    // 9. Reset PostgreSQL auto-increment SERIAL sequences
    console.log('\n🔢 Synchronizing PostgreSQL auto-increment sequences...');
    const serialTables = ['mustahik', 'applications', 'assessments', 'mpzis', 'ppd', 'documents', 'wa_logs'];
    for (const table of serialTables) {
      try {
        await pgDb.query(`
          SELECT setval(
            pg_get_serial_sequence('${table}', 'id'),
            COALESCE((SELECT MAX(id) FROM ${table}), 1)
          );
        `);
      } catch (seqErr) {
        console.warn(`   Sequence update warning for ${table}:`, seqErr.message);
      }
    }
    console.log('✅ PostgreSQL sequences synchronized.');

    console.log('\n====================================================');
    console.log('🎉 Migration SQLite to PostgreSQL Completed Successfully!');
    console.log('📊 Summary:');
    console.log(`   • Mustahik:      ${stats.mustahik} rows`);
    console.log(`   • Applications:  ${stats.applications} rows`);
    console.log(`   • Assessments:   ${stats.assessments} rows`);
    console.log(`   • MPZIS:         ${stats.mpzis} rows`);
    console.log(`   • PPD:           ${stats.ppd} rows`);
    console.log(`   • Documents:     ${stats.documents} rows`);
    console.log(`   • WA Logs:       ${stats.wa_logs} rows`);
    console.log(`   • Bot Sessions:  ${stats.bot_sessions} rows`);
    console.log('====================================================');
    return stats;
  } catch (err) {
    console.error('❌ Migration encountered an error:', err);
    throw err;
  } finally {
    if (sqliteDb) await sqliteDb.close();
  }
}

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].endsWith('migrate_sqlite_to_pg.js')) {
  migrateSqliteToPg()
    .then(() => {
      console.log('Migration script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
