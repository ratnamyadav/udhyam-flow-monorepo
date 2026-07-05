import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { router, tenantProcedure } from '../trpc';

export const customerRouter = router({
  list: tenantProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(100),
        })
        .default({ limit: 100 }),
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
        .limit(input.limit);
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
        email: z.string().email().nullable().optional(),
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
      await ctx.db.update(schema.customer).set(patch).where(eq(schema.customer.id, id));
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

// Helper used by booking.create — upsert a customer by (orgId, email||phone)
// and return its id. Email matches take precedence over phone matches because
// they're a stronger identifier (phone numbers are reused, emails generally
// aren't within a tenant).
export async function upsertCustomer(
  db: Db,
  organizationId: string,
  data: { name: string; email?: string; phone?: string },
): Promise<string> {
  const email = data.email?.toLowerCase().trim() || null;
  const phone = data.phone?.trim() || null;

  let existing: { id: string } | undefined;
  if (email) {
    [existing] = await db
      .select({ id: schema.customer.id })
      .from(schema.customer)
      .where(
        and(eq(schema.customer.organizationId, organizationId), eq(schema.customer.email, email)),
      );
  }
  if (!existing && phone) {
    [existing] = await db
      .select({ id: schema.customer.id })
      .from(schema.customer)
      .where(
        and(eq(schema.customer.organizationId, organizationId), eq(schema.customer.phone, phone)),
      );
  }

  if (existing) {
    await db
      .update(schema.customer)
      .set({
        name: data.name,
        email: email ?? undefined,
        phone: phone ?? undefined,
        lastBookingAt: new Date(),
      })
      .where(eq(schema.customer.id, existing.id));
    return existing.id;
  }

  const id = `cus_${randomUUID()}`;
  await db.insert(schema.customer).values({
    id,
    organizationId,
    name: data.name,
    email,
    phone,
    lastBookingAt: new Date(),
  });
  return id;
}
