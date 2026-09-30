import { db, schema } from '@udyamflow/db';
import { count } from 'drizzle-orm';

export async function GET() {
  try {
    const [{ value: orgs }] = (await db.select({ value: count() }).from(schema.organization)) as [
      { value: number },
    ];
    return Response.json({ ok: true, orgs });
  } catch (err) {
    // Log the detail server-side only — raw DB errors can leak hostnames,
    // usernames or schema details to anyone hitting this public endpoint.
    console.error('[health] database check failed', err);
    return Response.json({ ok: false }, { status: 503 });
  }
}
