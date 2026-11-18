import type { SQL } from 'drizzle-orm';
import type { Db } from './client';

// Neon HTTP returns rows directly; PGlite returns a query-result envelope.
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (Array.isArray(result) ? result : (result as unknown as { rows: T[] }).rows) as T[];
}
