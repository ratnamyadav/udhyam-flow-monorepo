import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, isConflictError, schema } from '@udyamflow/db';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeEmail, normalizePhone } from '../lib/validate';
import { router, tenantProcedure } from '../trpc';

export const customerRouter = router({
  list: tenantProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(100),
          offset: z.number().int().min(0).default(0),
        })
        .default({ limit: 100, offset: 0 }),
    )
    .query(({ ctx, input }) => {
      const conditions = [eq(schema.customer.organizationId, ctx.organizationId)];
      if (input.query) {
        const like = `%${input.query}%`;
        const filter = or(
          ilike(schema.customer.name, like),
          ilike(schema.customer.email, like),
          ilike(schema.customer.phone, like),
        );
        if (filter) conditions.push(filter);
      }
      return ctx.db
        .select()
        .from(schema.customer)
        .where(and(...conditions))
        .orderBy(desc(schema.customer.lastBookingAt), desc(schema.customer.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  get: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(schema.customer)
      .where(
        and(
          eq(schema.customer.id, input.id),
          eq(schema.customer.organizationId, ctx.organizationId),
        ),
      );
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
    return row;
  }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        email: z.email().nullable().optional(),
        phone: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: schema.customer.id })
        .from(schema.customer)
        .where(
          and(
            eq(schema.customer.id, input.id),
            eq(schema.customer.organizationId, ctx.organizationId),
          ),
        );
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      const { id, ...patch } = input;
      if (patch.email !== undefined) patch.email = normalizeEmail(patch.email);
      if (patch.phone !== undefined) patch.phone = normalizePhone(patch.phone);
      try {
        await ctx.db.update(schema.customer).set(patch).where(eq(schema.customer.id, id));
      } catch (err) {
        if (isConflictError(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Another customer already has that email or phone.',
          });
        }
        throw err;
      }
      return { ok: true };
    }),

  listBookings: tenantProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) =>
    ctx.db
      .select()
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.customerId, input.id),
          eq(schema.booking.organizationId, ctx.organizationId),
        ),
      )
      .orderBy(desc(schema.booking.slotStart)),
  ),
});

// Helper used by booking.create — find-or-create a customer by (orgId,
// email) then (orgId, phone) and return its id. Email matches take
// precedence over phone matches because they're a stronger identifier.
//
// This runs on an unauthenticated endpoint, so it never overwrites what the
// tenant already has on file (anyone can type someone else's email) — it only
// fills in blanks, and skips a phone that already belongs to another
// customer rather than tripping the unique index.
export async function upsertCustomer(
  db: Db,
  organizationId: string,
  data: { name: string; email?: string; phone?: string },
): Promise<string> {
  const email = normalizeEmail(data.email);
  const phone = normalizePhone(data.phone);

  const findBy = async (col: 'email' | 'phone', value: string) => {
    const [row] = await db
      .select()
      .from(schema.customer)
      .where(
        and(eq(schema.customer.organizationId, organizationId), eq(schema.customer[col], value)),
      );
    return row;
  };

  let existing = email ? await findBy('email', email) : undefined;
  if (!existing && phone) existing = await findBy('phone', phone);

  if (existing) {
    const patch: Partial<typeof schema.customer.$inferInsert> = { lastBookingAt: new Date() };
    if (!existing.email && email) patch.email = email;
    if (!existing.phone && phone && !(await findBy('phone', phone))) patch.phone = phone;
    try {
      await db.update(schema.customer).set(patch).where(eq(schema.customer.id, existing.id));
    } catch (err) {
      // A concurrent booking claimed the email/phone we were filling in.
      if (!isConflictError(err)) throw err;
      await db
        .update(schema.customer)
        .set({ lastBookingAt: new Date() })
        .where(eq(schema.customer.id, existing.id));
    }
    return existing.id;
  }

  const id = `cus_${randomUUID()}`;
  const inserted = await db
    .insert(schema.customer)
    .values({ id, organizationId, name: data.name, email, phone, lastBookingAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: schema.customer.id });
  if (inserted[0]) return inserted[0].id;

  // Lost a race with a concurrent first-time booking for the same person.
  const winner =
    (email && (await findBy('email', email))) || (phone && (await findBy('phone', phone)));
  if (winner) return winner.id;
  throw new TRPCError({ code: 'CONFLICT', message: 'Could not save customer — please retry.' });
}
