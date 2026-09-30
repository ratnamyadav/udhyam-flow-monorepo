import { db, schema } from '@udyamflow/db';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { CashfreeMandateCheckout } from '@/components/memberships/cashfree-mandate-checkout';
import { loadPublicTenant, NoticeCard, PublicShell } from '@/components/memberships/public-shell';

// The membership "authorization link": resolves our subscription id to its
// Cashfree session and opens the mandate checkout. Doubles as a resume link
// if the customer closed the Cashfree window before approving.

export const metadata = { robots: { index: false } };

export default async function AuthorizeMembershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { orgSlug } = await params;
  const { sub } = await searchParams;
  const tenant = await loadPublicTenant(orgSlug);
  if (!tenant) notFound();
  const { org, theme } = tenant;

  const [row] = sub
    ? await db
        .select({
          id: schema.membershipSubscription.id,
          status: schema.membershipSubscription.status,
          sessionId: schema.membershipSubscription.cashfreeSessionId,
        })
        .from(schema.membershipSubscription)
        .where(
          and(
            eq(schema.membershipSubscription.id, sub),
            eq(schema.membershipSubscription.organizationId, org.id),
          ),
        )
    : [];

  if (!row) {
    return (
      <PublicShell theme={theme} orgSlug={orgSlug}>
        <NoticeCard
          theme={theme}
          title="Membership not found"
          body="This approval link doesn't match a membership sign-up."
          href={`/book/${orgSlug}/memberships`}
          cta="See memberships"
        />
      </PublicShell>
    );
  }

  // Already approved (or finished one way or another) — show the outcome.
  if (row.status !== 'initialized' || !row.sessionId) {
    redirect(`/book/${orgSlug}/memberships/return?sub=${encodeURIComponent(row.id)}`);
  }

  return (
    <PublicShell theme={theme} orgSlug={orgSlug}>
      <CashfreeMandateCheckout
        sessionId={row.sessionId}
        mode={process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox'}
        theme={theme}
      />
    </PublicShell>
  );
}
