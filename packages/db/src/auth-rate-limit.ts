import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { verification } from './schema/auth';

// One atomic UPSERT gates all app processes using the existing verification
// primary key. Identifiers contain hashes rather than raw addresses/IPs.
export async function takeAuthRateLimit(
  database: Db,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const id = `auth-limit-${createHash('sha256').update(key).digest('hex')}`;
  const rows = await database
    .insert(verification)
    .values({
      id,
      identifier: id,
      value: '1',
      expiresAt: sql`now() + ${windowSeconds} * interval '1 second'`,
    })
    .onConflictDoUpdate({
      target: verification.id,
      set: {
        value: sql`CASE WHEN ${verification.expiresAt} <= now() THEN '1' ELSE (CAST(${verification.value} AS integer) + 1)::text END`,
        expiresAt: sql`CASE WHEN ${verification.expiresAt} <= now() THEN now() + ${windowSeconds} * interval '1 second' ELSE ${verification.expiresAt} END`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${verification.expiresAt} <= now() OR CAST(${verification.value} AS integer) < ${limit}`,
    })
    .returning({ id: verification.id });
  return rows.length === 1;
}
