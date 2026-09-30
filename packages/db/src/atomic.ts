import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from './client';

// Runs several write statements atomically. The production driver
// (neon-http) has no interactive transactions, but `db.batch` sends the
// statements as one implicit transaction — all commit or none do.
//
// Build the queries without awaiting them:
//   await atomic(db, [db.delete(t).where(…), db.insert(t).values(…)]);
//
// Drivers without `batch` (e.g. PGlite in tests) run them in order.
export async function atomic(db: Db, queries: BatchItem<'pg'>[]): Promise<void> {
  const [first, ...rest] = queries;
  if (!first) return;
  if (typeof (db as { batch?: unknown }).batch === 'function') {
    await db.batch([first, ...rest]);
    return;
  }
  for (const q of queries) await q;
}

// Postgres error codes we map to user-facing conflicts.
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';

// Walks `cause` chains (drizzle wraps driver errors) looking for a Postgres
// SQLSTATE code.
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isConflictError(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code === PG_UNIQUE_VIOLATION || code === PG_EXCLUSION_VIOLATION;
}
