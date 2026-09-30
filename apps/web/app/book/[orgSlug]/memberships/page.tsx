import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MembershipSignup } from '@/components/memberships/membership-signup';
import { loadPublicTenant, NoticeCard, PublicShell } from '@/components/memberships/public-shell';
import { trpcServer } from '@/lib/trpc/server';

// Public membership catalog: plan cards + sign-up form. Subscribing hands
// the customer to Cashfree to approve a UPI Autopay / eNACH / card mandate.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const tenant = await loadPublicTenant(orgSlug);
  return {
    title: tenant ? `Memberships — ${tenant.org.name}` : 'Memberships — UdyamFlow',
    robots: { index: false },
  };
}

export default async function MembershipsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const tenant = await loadPublicTenant(orgSlug);
  if (!tenant) notFound();
  const { theme } = tenant;

  const plans = await (await trpcServer()).membership.publicPlans({ orgSlug });

  return (
    <PublicShell theme={theme} orgSlug={orgSlug}>
      {plans.length === 0 ? (
        <NoticeCard
          theme={theme}
          title="No memberships right now"
          body={`${theme.name} isn't offering memberships at the moment.`}
          href={`/book/${orgSlug}`}
          cta="Book a single session"
        />
      ) : (
        <>
          <div className="mb-8 max-w-[640px]">
            <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
              Memberships
            </div>
            <h1
              className="text-[30px] m-0 font-medium tracking-tight text-ink"
              style={{ fontFamily: theme.fontDisplay, lineHeight: 1.15 }}
            >
              Join {theme.name}
            </h1>
            <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
              Approve a one-time mandate with UPI Autopay, net banking (eNACH) or your card and your
              membership renews automatically. Cancel any time.
            </p>
          </div>
          <MembershipSignup orgSlug={orgSlug} theme={theme} plans={plans} />
        </>
      )}
    </PublicShell>
  );
}
