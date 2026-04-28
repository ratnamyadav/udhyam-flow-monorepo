import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Lazy: we want imports of `@udyamflow/db` to be cheap at module init time so
// Next.js can do its build-time module evaluation pass without DATABASE_URL.
// The first actual query is what triggers the env check + connection.
let _db: ReturnType<typeof makeDb> | null = null;

function makeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = neon(url);
  return drizzle({ client: sql, schema, casing: 'snake_case' });
}

export const db = new Proxy({} as ReturnType<typeof makeDb>, {
  get(_target, prop) {
    if (!_db) _db = makeDb();
    return Reflect.get(_db as object, prop);
  },
});

export type Db = ReturnType<typeof makeDb>;
