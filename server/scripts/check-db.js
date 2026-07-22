import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const tables = await client.query(`
  select
    to_regclass('public.settings') as settings_table,
    to_regclass('public.simulations') as simulations_table
`);

console.log('tables');
console.log(JSON.stringify(tables.rows, null, 2));

try {
  const settings = await client.query('select * from public.settings order by id');
  console.log('settings');
  console.log(JSON.stringify(settings.rows, null, 2));
} catch (error) {
  console.log('settings_error');
  console.log(JSON.stringify({ message: error.message, code: error.code }, null, 2));
}

try {
  const simulations = await client.query('select count(*)::int as count from public.simulations');
  console.log('simulations_count');
  console.log(JSON.stringify(simulations.rows, null, 2));
} catch (error) {
  console.log('simulations_error');
  console.log(JSON.stringify({ message: error.message, code: error.code }, null, 2));
}

await client.end();
