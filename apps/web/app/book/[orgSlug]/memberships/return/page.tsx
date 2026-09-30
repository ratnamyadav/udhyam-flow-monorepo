import {
  cashfreeSubscriptionsFromEnv,
  syncSubscriptionFromCashfree,
} from '@udyamflow/api/memberships';
import { db, schema } from '@udyamflow/db';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { formatCadence, formatMoney } from '@/components/memberships/format';
import { loadPublicTenant, NoticeCard, PublicShell } from '@/components/memberships/public-shell';

// Cashfree sends the customer here after the mandate step. The webhook
// usually hasn't landed yet, so while the mandate is still settling we ask
// Cashfree directly (throttled via synced_at) and refresh a few times.

export const metadata = { robots: { index: false } };

const SYNC_THROTTLE_MS = 10_000;
const MAX_REFRESHES = 12; // ~1 minute of 5s refreshes

async function loadRow(orgId: string, subId: string) {
  const [found] = await db
    .select({
      sub: schema.membershipSubscription,
      planName: schema.membershipPlan.name,
      amountCents: schema.membershipPlan.amountCents,
      currency: schema.membershipPlan.currency,
      interval: schema.membershipPlan.interval,
      intervalCount: schema.membershipPlan.intervalCount,
      customerName: schema.customer.name,
    })
    .from(schema.membershipSubscription)
    .innerJoin(
      schema.membershipPlan,
      eq(schema.membershipPlan.id, schema.membershipSubscription.planId),
    )
    .innerJoin(schema.customer, eq(schema.customer.id, schema.membershipSubscription.customerId))
    .where(
      and(
        eq(schema.membershipSubscription.id, subId),
        eq(schema.membershipSubscription.organizationId, orgId),
      ),
    );
  return found ?? null;
}

export default async function MembershipReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ sub?: string; n?: string }>;
}) {
  const { orgSlug } = await params;
  const { sub, n } = await searchParams;
  const tenant = await loadPublicTenant(orgSlug);
  if (!tenant) notFound();
  const { org, theme } = tenant;
  const membershipsHref = `/book/${orgSlug}/memberships`;

  let found = sub ? await loadRow(org.id, sub) : null;
  if (!found) {
    return (
      <PublicShell theme={theme} orgSlug={orgSlug}>
        <NoticeCard
          theme={theme}
          title="Membership not found"
          body="The reference in this link doesn't match a membership sign-up."
          href={membershipsHref}
          cta="See memberships"
        />
      </PublicShell>
    );
  }

  const settling = found.sub.status === 'initialized' || found.sub.status === 'pending_approval';
  const stale = !found.sub.syncedAt || Date.now() - found.sub.syncedAt.getTime() > SYNC_THROTTLE_MS;
  const client = cashfreeSubscriptionsFromEnv();
  if (settling && stale && client) {
    try {
      await syncSubscriptionFromCashfree(db, client, found.sub);
      found = (await loadRow(org.id, found.sub.id)) ?? found;
    } catch (err) {
      console.warn('[memberships] return-page sync failed', err);
    }
  }

  const { sub: row } = found;
  const price = `${formatMoney(found.amountCents, found.currency)} ${formatCadence(found.interval, found.intervalCount)}`;
  const firstName = found.customerName.split(' ')[0];
  const attempt = Number(n) || 0;
  const stillSettling = row.status === 'initialized' || row.status === 'pending_approval';
  const refreshUrl =
    stillSettling && attempt < MAX_REFRESHES
      ? `/book/${orgSlug}/memberships/return?sub=${encodeURIComponent(row.id)}&n=${attempt + 1}`
      : undefined;
  const nextCharge = row.nextChargeAt?.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  let card: React.ReactNode;
  switch (row.status) {
    case 'active':
      card = (
        <NoticeCard
          theme={theme}
          title={`You're a member, ${firstName}.`}
          body={
            <>
              <strong className="text-ink">{found.planName}</strong> is active at {price}.{' '}
              {nextCharge ? `Your next payment is on ${nextCharge}.` : ''} Your bank will debit it
              automatically — you'll get a notice before each debit.
            </>
          }
          href={`/book/${orgSlug}`}
          cta="Book a session"
        />
      );
      break;
    case 'pending_approval':
      card = (
        <NoticeCard
          theme={theme}
          title="Mandate submitted"
          body={
            <>
              Thanks, {firstName}. Your bank is confirming the mandate for{' '}
              <strong className="text-ink">{found.planName}</strong> ({price}). UPI Autopay usually
              confirms in minutes; net-banking (eNACH) mandates can take 1–2 working days. We'll
              activate your membership automatically.
            </>
          }
          href={`/book/${orgSlug}`}
          cta="Back to booking"
        />
      );
      break;
    case 'initialized':
      card = (
        <NoticeCard
          theme={theme}
          title={refreshUrl ? 'Checking your approval…' : 'Mandate not approved yet'}
          body={
            refreshUrl
              ? 'This usually takes a few seconds. This page refreshes on its own.'
              : "We haven't received an approval for this membership. If you closed the Cashfree window, you can pick up where you left off."
          }
          href={
            refreshUrl || !row.cashfreeSessionId
              ? undefined
              : `/book/${orgSlug}/memberships/authorize?sub=${encodeURIComponent(row.id)}`
          }
          cta="Approve mandate"
        />
      );
      break;
    case 'paused':
    case 'on_hold':
      card = (
        <NoticeCard
          theme={theme}
          title={`Membership ${row.status === 'paused' ? 'paused' : 'on hold'}`}
          body={`Your ${found.planName} membership isn't collecting payments right now. Contact ${theme.name} if this is unexpected.`}
          href={`/book/${orgSlug}`}
          cta="Back to booking"
        />
      );
      break;
    default:
      card = (
        <NoticeCard
          theme={theme}
          title="Membership not active"
          body={
            row.status === 'failed'
              ? "We couldn't start the sign-up with the payment provider. No money was taken — please try again."
              : `This ${found.planName} membership is ${row.status}. No further payments will be taken.`
          }
          href={membershipsHref}
          cta="See memberships"
        />
      );
  }

  return (
    <PublicShell theme={theme} orgSlug={orgSlug} refreshUrl={refreshUrl}>
      {card}
    </PublicShell>
  );
}
