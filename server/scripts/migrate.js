import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL com a connection string do Postgres do Supabase para executar a migration.');
  process.exit(1);
}

const sql = await fs.readFile(path.join(__dirname, '..', '..', 'supabase', 'migration.sql'), 'utf8');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
await client.query(sql);

const { rows } = await client.query(`
  select
    to_regclass('public.settings') as settings_table,
    to_regclass('public.simulations') as simulations_table,
    to_regclass('public.shared_simulations') as shared_simulations_table,
    exists(select 1 from public.settings where id = 1) as default_settings_exists
`);

await client.end();
console.table(rows);
