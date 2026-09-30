// Applies CONSTRAINTS_SQL to the database in DATABASE_URL. Chained after
// `drizzle-kit push` by the `db:push` script; safe to re-run.
//
// Usage: pnpm db:constraints

import { neon } from '@neondatabase/serverless';
import { CONSTRAINTS_SQL } from './constraints';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = neon(url);
  for (const statement of CONSTRAINTS_SQL) {
    await sql.query(statement);
  }
  console.log('Constraints applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
