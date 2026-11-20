import { TRPCError } from '@trpc/server';
import { type Db, SLOT_BLOCKING_STATUSES, schema } from '@udyamflow/db';
import { and, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { cancelLocationSubscription } from '../billing/service';
import { cashfreeSubscriptionsFromEnv } from '../memberships/cashfree-subscriptions';
import { cancelSubscription } from '../memberships/service';
import { isTerminalSubscriptionStatus } from '../memberships/status';

const LIVE_BILLING = ['initializing', 'pending', 'active', 'past_due'] as const;

// Deletes a user account (App Store / Play Store account deletion).
//
// Workspaces the user shares keep running: their membership is removed, but
// a workspace that would be left with members and no owner blocks deletion
// until ownership is handed over. A workspace the user runs alone is closed:
// billing and customers' recurring memberships are cancelled and its
// locations archived, so the booking page stops taking bookings. Its
// booking, invoice and payment records are kept, as tax law requires.
export async function deleteAccount(db: Db, userId: string): Promise<{ closed: string[] }> {
  const memberships = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
      name: schema.organization.name,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId));

  // Check everything before changing anything.
  const closing: { id: string; name: string }[] = [];
  for (const m of memberships) {
    if (m.role !== 'owner') continue;
    const others = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, m.organizationId), ne(schema.member.userId, userId)),
      );
    if (others.some((o) => o.role === 'owner')) continue;
    if (others.length > 0)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Make someone else an owner of ${m.name} first, or remove its other members.`,
      });
    const upcoming = await db
      .select({ id: schema.booking.id })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, m.organizationId),
          gte(schema.booking.slotStart, new Date()),
          inArray(schema.booking.status, [...SLOT_BLOCKING_STATUSES]),
        ),
      )
      .limit(1);
    if (upcoming.length)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cancel the upcoming bookings at ${m.name} first, so no customer turns up to a closed business.`,
      });
    closing.push({ id: m.organizationId, name: m.name });
  }

  for (const org of closing) await closeWorkspace(db, org.id);

  // Sessions, sign-in methods and memberships go with the user (cascade).
  await db.delete(schema.user).where(eq(schema.user.id, userId));
  return { closed: closing.map((o) => o.name) };
}

async function closeWorkspace(db: Db, organizationId: string) {
  const billing = await db
    .select()
    .from(schema.locationSubscription)
    .where(
      and(
        eq(schema.locationSubscription.organizationId, organizationId),
        inArray(schema.locationSubscription.status, [...LIVE_BILLING]),
      ),
    );
  for (const row of billing) await cancelLocationSubscription(db, row);

  const memberships = await db
    .select()
    .from(schema.membershipSubscription)
    .where(eq(schema.membershipSubscription.organizationId, organizationId));
  const live = memberships.filter((row) => !isTerminalSubscriptionStatus(row.status));
  if (live.length) {
    const client = cashfreeSubscriptionsFromEnv();
    for (const row of live) await cancelSubscription(db, client, row);
  }

  const now = new Date();
  await db
    .update(schema.resource)
    .set({ archivedAt: now })
    .where(
      and(eq(schema.resource.organizationId, organizationId), isNull(schema.resource.archivedAt)),
    );
  await db
    .update(schema.location)
    .set({ archivedAt: now })
    .where(
      and(eq(schema.location.organizationId, organizationId), isNull(schema.location.archivedAt)),
    );
}
