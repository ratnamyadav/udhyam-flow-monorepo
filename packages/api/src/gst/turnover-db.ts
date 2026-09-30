// Financial-year turnover per store, from payments taken through
// UdyamFlow: paid INR bookings (at their service price) plus paid INR
// membership debits. Refunded bookings drop out because their status
// changes to `refunded`.

import { type Db, schema } from '@udyamflow/db';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { financialYearRange, resolveTurnoverLimit, turnoverLevel } from './turnover';

export async function getFyTurnover(
  db: Db,
  now = new Date(),
  organizationIds?: string[],
): Promise<Map<string, number>> {
  const { start, end } = financialYearRange(now);
  const bookingOrg = organizationIds
    ? inArray(schema.booking.organizationId, organizationIds)
    : undefined;
  const memberOrg = organizationIds
    ? inArray(schema.membershipPayment.organizationId, organizationIds)
    : undefined;

  const [bookings, memberships] = await Promise.all([
    db
      .select({
        orgId: schema.booking.organizationId,
        cents: sql<string>`coalesce(sum(${schema.service.priceCents}), 0)`,
      })
      .from(schema.booking)
      .innerJoin(schema.service, eq(schema.service.id, schema.booking.serviceId))
      .where(
        and(
          eq(schema.booking.paymentStatus, 'paid'),
          eq(schema.service.currency, 'INR'),
          gte(schema.booking.slotStart, start),
          lt(schema.booking.slotStart, end),
          bookingOrg,
        ),
      )
      .groupBy(schema.booking.organizationId),
    db
      .select({
        orgId: schema.membershipPayment.organizationId,
        cents: sql<string>`coalesce(sum(${schema.membershipPayment.amountCents}), 0)`,
      })
      .from(schema.membershipPayment)
      .where(
        and(
          eq(schema.membershipPayment.status, 'paid'),
          eq(schema.membershipPayment.currency, 'INR'),
          gte(schema.membershipPayment.paidAt, start),
          lt(schema.membershipPayment.paidAt, end),
          memberOrg,
        ),
      )
      .groupBy(schema.membershipPayment.organizationId),
  ]);

  const totals = new Map<string, number>();
  for (const r of [...bookings, ...memberships]) {
    totals.set(r.orgId, (totals.get(r.orgId) ?? 0) + Number(r.cents));
  }
  return totals;
}

export async function getPlatformTurnoverLimit(db: Db): Promise<number | null> {
  const [row] = await db
    .select({ cents: schema.platformSettings.gstTurnoverLimitCents })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.id, schema.PLATFORM_SETTINGS_ID));
  return row?.cents ?? null;
}

// Everything the store UI needs to show the registration-limit panel.
export async function getStoreGstTurnover(db: Db, organizationId: string, now = new Date()) {
  const [[settings], platformCents, totals] = await Promise.all([
    db
      .select({
        registered: schema.tenantSettings.gstRegistered,
        stateCode: schema.tenantSettings.gstStateCode,
        storeCents: schema.tenantSettings.gstTurnoverLimitCents,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, organizationId)),
    getPlatformTurnoverLimit(db),
    getFyTurnover(db, now, [organizationId]),
  ]);
  const { limitCents, source } = resolveTurnoverLimit({
    storeCents: settings?.storeCents,
    platformCents,
    stateCode: settings?.stateCode,
  });
  const turnoverCents = totals.get(organizationId) ?? 0;
  return {
    financialYear: financialYearRange(now).label,
    turnoverCents,
    limitCents,
    limitSource: source,
    storeLimitCents: settings?.storeCents ?? null,
    platformLimitCents: platformCents,
    registered: settings?.registered ?? false,
    // Indian business (state set) or has INR turnover — otherwise the
    // UI hides the GST limit entirely.
    applicable: !!settings?.stateCode || turnoverCents > 0,
    level: turnoverLevel(turnoverCents, limitCents),
  };
}
