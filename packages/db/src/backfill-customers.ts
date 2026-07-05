// One-shot backfill: walks every booking missing a customer_id and runs
// the same upsert logic the booking router uses at write time, so the
// CRM page shows historical bookers immediately.
//
// Usage: pnpm db:backfill-customers
// Safe to run more than once — the upsert dedupes.

import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './client';
import { booking, customer } from './schema';

async function upsertCustomer(
  organizationId: string,
  data: { name: string; email?: string; phone?: string },
): Promise<string> {
  const email = data.email?.toLowerCase().trim() || null;
  const phone = data.phone?.trim() || null;

  let existing: { id: string } | undefined;
  if (email) {
    [existing] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(and(eq(customer.organizationId, organizationId), eq(customer.email, email)));
  }
  if (!existing && phone) {
    [existing] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(and(eq(customer.organizationId, organizationId), eq(customer.phone, phone)));
  }
  if (existing) return existing.id;

  const id = `cus_${randomUUID()}`;
  await db.insert(customer).values({
    id,
    organizationId,
    name: data.name,
    email,
    phone,
    lastBookingAt: new Date(),
  });
  return id;
}

async function main() {
  console.log('Backfilling customers for legacy bookings…');
  const orphaned = await db
    .select({
      id: booking.id,
      organizationId: booking.organizationId,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
    })
    .from(booking)
    .where(isNull(booking.customerId));

  console.log(`  ${orphaned.length} booking(s) without customer_id`);
  let linked = 0;
  for (const b of orphaned) {
    const id = await upsertCustomer(b.organizationId, {
      name: b.customerName,
      email: b.customerEmail ?? undefined,
      phone: b.customerPhone ?? undefined,
    });
    await db.update(booking).set({ customerId: id }).where(eq(booking.id, b.id));
    linked += 1;
  }
  console.log(`  ✓ linked ${linked} bookings to customers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
