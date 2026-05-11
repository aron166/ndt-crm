import 'dotenv/config';
import { sourcePool } from './lib/source-db';

const TABLES = ['companies', 'contacts', 'interactions', 'proposals', 'invoices', 'leads'];

async function main(): Promise<void> {
  for (const table of TABLES) {
    const { rows } = await sourcePool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );

    console.log(`\n── ${table} (${rows.length} columns) ──`);
    for (const row of rows) {
      console.log(`  ${row.column_name.padEnd(35)} ${row.data_type}`);
    }

    // Print one sample row
    const sample = await sourcePool.query(`SELECT * FROM ${table} LIMIT 1`);
    if (sample.rows.length > 0) {
      console.log('  sample:', JSON.stringify(sample.rows[0], null, 2));
    }
  }

  await sourcePool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
