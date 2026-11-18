import { TRPCError } from '@trpc/server';
import { type Db, queryRows, schema } from '@udyamflow/db';
import { and, eq, gt, isNull, lte, type SQL, sql } from 'drizzle-orm';
import { normalizeEmail, normalizePhone } from '../lib/validate';
import { normalizeIndianMobile } from './status';

// Subscription states whose paid cycles can still be spent.
const SPENDABLE_STATUSES = ['active', 'cancelled', 'paused', 'on_hold'] as const;

// A Date as a UTC `timestamp` (without time zone) literal. Raw `sql`
// params bypass Drizzle's column mapping, and the Neon driver serializes a
// Date in the server's local zone with an offset that Postgres drops for
// `timestamp` — a non-UTC server would store/compare local wall time while
// the rest of the app (Drizzle's `toISOString()` mapping) stores UTC.
export function utcTimestamp(d: Date): SQL {
  return sql`${d.toISOString()}::timestamp`;
}

function comparablePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizeIndianMobile(raw) ?? normalizePhone(raw);
}

// The subscription id in `?membership=` is shareable, so it is not proof of
// identity: the booker must also give the member's email (case-insensitive)
// or phone (normalized).
export function contactMatchesMember(
  member: { email: string | null; phone: string | null },
  input: { email?: string | null; phone?: string | null },
): boolean {
  const email = normalizeEmail(input.email);
  if (email && email === normalizeEmail(member.email)) return true;
  const phone = comparablePhone(input.phone);
  return !!phone && phone === comparablePhone(member.phone);
}

export function cycleEnd(start: Date, interval: 'week' | 'month' | 'year', count: number): Date {
  const end = new Date(start);
  if (interval === 'week') {
    end.setUTCDate(end.getUTCDate() + count * 7);
    return end;
  }
  const day = end.getUTCDate();
  end.setUTCDate(1);
  if (interval === 'year') end.setUTCFullYear(end.getUTCFullYear() + count);
  else end.setUTCMonth(end.getUTCMonth() + count);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}

export async function grantPaidCycle(db: Db, paymentId: string) {
  const [row] = await db
    .select({ payment: schema.membershipPayment, plan: schema.membershipPlan })
    .from(schema.membershipPayment)
    .innerJoin(
      schema.membershipSubscription,
      eq(schema.membershipSubscription.id, schema.membershipPayment.subscriptionId),
    )
    .innerJoin(
      schema.membershipPlan,
      eq(schema.membershipPlan.id, schema.membershipSubscription.planId),
    )
    .where(eq(schema.membershipPayment.id, paymentId));
  if (
    !row ||
    row.payment.status !== 'paid' ||
    !row.payment.paidAt ||
    row.payment.amountCents !== row.plan.amountCents
  )
    return;
  await db
    .insert(schema.membershipCycle)
    .values({
      id: `cycle_${row.payment.id}`,
      subscriptionId: row.payment.subscriptionId,
      paymentId: row.payment.id,
      startsAt: row.payment.paidAt,
      endsAt: cycleEnd(row.payment.paidAt, row.plan.interval, row.plan.intervalCount),
      sessionLimit: row.plan.sessionsPerCycle,
    })
    .onConflictDoNothing();
}

export async function membershipBenefit(
  db: Db,
  organizationId: string,
  subscriptionId: string,
  now = new Date(),
) {
  const [sub] = await db
    .select({
      sub: schema.membershipSubscription,
      customer: schema.customer,
      plan: schema.membershipPlan,
    })
    .from(schema.membershipSubscription)
    .innerJoin(schema.customer, eq(schema.customer.id, schema.membershipSubscription.customerId))
    .innerJoin(
      schema.membershipPlan,
      eq(schema.membershipPlan.id, schema.membershipSubscription.planId),
    )
    .where(
      and(
        eq(schema.membershipSubscription.id, subscriptionId),
        eq(schema.membershipSubscription.organizationId, organizationId),
      ),
    );
  if (!sub || !(SPENDABLE_STATUSES as readonly string[]).includes(sub.sub.status)) return null;
  const [cycle] = await db
    .select()
    .from(schema.membershipCycle)
    .where(
      and(
        eq(schema.membershipCycle.subscriptionId, subscriptionId),
        lte(schema.membershipCycle.startsAt, now),
        gt(schema.membershipCycle.endsAt, now),
      ),
    )
    .orderBy(sql`${schema.membershipCycle.startsAt} DESC`)
    .limit(1);
  if (!cycle) return null;
  const covered = await db
    .select({ serviceId: schema.membershipPlanService.serviceId })
    .from(schema.membershipPlanService)
    .innerJoin(schema.service, eq(schema.service.id, schema.membershipPlanService.serviceId))
    .where(
      and(eq(schema.membershipPlanService.planId, sub.plan.id), isNull(schema.service.archivedAt)),
    );
  return { ...sub, cycle, serviceIds: covered.map((c) => c.serviceId) };
}

// Spends one credit and inserts the booking in a single statement, so the
// checks (cycle covers now and the slot, sessions left, subscription still
// spendable, service on the plan) and the spend can't race.
export async function insertCoveredBooking(
  db: Db,
  cycleId: string,
  booking: typeof schema.booking.$inferInsert,
  now = new Date(),
) {
  const at = utcTimestamp(now);
  const slotStart = utcTimestamp(booking.slotStart);
  const slotEnd = utcTimestamp(booking.slotEnd);
  const rows = await queryRows<{ id: string }>(
    db,
    sql`
    WITH credit AS (
      UPDATE membership_cycle SET sessions_used = sessions_used + 1
      WHERE id = ${cycleId} AND starts_at <= ${at} AND ends_at > ${at}
        AND starts_at <= ${slotStart} AND ends_at > ${slotStart}
        AND (session_limit IS NULL OR sessions_used < session_limit)
        AND EXISTS (
          SELECT 1 FROM membership_subscription s
          JOIN membership_plan_service ps ON ps.plan_id = s.plan_id
          JOIN service svc ON svc.id = ps.service_id AND svc.archived_at IS NULL
          WHERE s.id = membership_cycle.subscription_id
            AND s.status IN (${sql.join(
              SPENDABLE_STATUSES.map((v) => sql`${v}`),
              sql`, `,
            )})
            AND ps.service_id = ${booking.serviceId ?? null}
        )
      RETURNING id
    ), inserted AS (
      INSERT INTO booking (id, organization_id, location_id, resource_id, service_id, customer_id, customer_name, customer_email, customer_phone,
        slot_start, slot_end, status, payment_status, payment_provider, amount_cents, currency, meeting_url, source, intake, service_snapshot)
      SELECT ${booking.id}, ${booking.organizationId}, ${booking.locationId}, ${booking.resourceId}, ${booking.serviceId ?? null}, ${booking.customerId ?? null},
        ${booking.customerName}, ${booking.customerEmail ?? null}, ${booking.customerPhone ?? null}, ${slotStart}, ${slotEnd},
        'confirmed', 'covered', 'membership', 0, ${booking.currency ?? 'INR'}, ${booking.meetingUrl ?? null}, ${booking.source ?? null},
        ${JSON.stringify(booking.intake ?? null)}::jsonb, ${JSON.stringify(booking.serviceSnapshot ?? null)}::jsonb FROM credit RETURNING id
    )
    INSERT INTO membership_usage (booking_id, cycle_id) SELECT inserted.id, credit.id FROM inserted, credit RETURNING booking_id AS id
  `,
  );
  if (!rows.length)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Your membership can no longer cover this booking (no sessions left for this date, or the service is no longer included). Choose another time or book without the membership.',
    });
}

export async function releaseMembershipCredit(db: Db, bookingId: string, now = new Date()) {
  const at = utcTimestamp(now);
  await db.execute(sql`
    WITH released AS (
      UPDATE membership_usage SET released_at = ${at} WHERE booking_id = ${bookingId} AND released_at IS NULL
        AND EXISTS (SELECT 1 FROM booking WHERE id = ${bookingId} AND status = 'cancelled' AND slot_start > ${at}) RETURNING cycle_id
    )
    UPDATE membership_cycle SET sessions_used = greatest(0, sessions_used - 1) FROM released WHERE id = released.cycle_id
  `);
}
