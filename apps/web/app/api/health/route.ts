import { db, schema } from '@udyamflow/db';
import { count } from 'drizzle-orm';

export async function GET() {
  try {
    const [{ value: orgs }] = (await db.select({ value: count() }).from(schema.organization)) as [
      { value: number },
    ];
    return Response.json({ ok: true, orgs });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
