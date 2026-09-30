'use client';

import { Button } from '@udyamflow/ui';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

// Stripe Connect status + onboarding launcher. Lives next to the static
// Cashfree card on /settings/payments.

export function StripeConnectCard({ platformReady }: { platformReady: boolean }) {
  return (
    <Suspense fallback={<Shell name="Stripe" subtitle="Global · USD" />}>
      <StripeConnectInner platformReady={platformReady} />
    </Suspense>
  );
}

function StripeConnectInner({ platformReady }: { platformReady: boolean }) {
  const status = trpc.payment.stripeStatus.useQuery(undefined, { enabled: platformReady });
  const connect = trpc.payment.connectStripe.useMutation();
  const { isAdmin } = useActiveRole();
  const search = useSearchParams();
  const [flash, setFlash] = useState<string | null>(null);

  // Show a one-line message after the user returns from Stripe onboarding.
  useEffect(() => {
    const v = search.get('stripe');
    if (v === 'done') setFlash('Stripe onboarding link returned. Status updating…');
    if (v === 'refresh') setFlash('Onboarding link expired — start again.');
  }, [search]);

  const accountId = status.data?.accountId ?? null;
  const chargesEnabled = status.data?.chargesEnabled ?? false;

  let badge: { label: string; tone: 'good' | 'pending' | 'off' } = {
    label: 'Not connected',
    tone: 'off',
  };
  if (!platformReady) badge = { label: 'Not configured', tone: 'off' };
  else if (accountId && chargesEnabled) badge = { label: 'Connected', tone: 'good' };
  else if (accountId) badge = { label: 'Onboarding', tone: 'pending' };

  function start() {
    connect.mutate(undefined, { onSuccess: (res) => window.location.assign(res.url) });
  }

  return (
    <Shell
      name="Stripe"
      subtitle="Global · USD"
      badge={
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: badge.tone === 'good' ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
            color: badge.tone === 'good' ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
          }}
        >
          {badge.label}
        </span>
      }
    >
      {!platformReady && (
        <div className="mt-3 text-[12px] text-ink-mute">
          Server isn't configured for Stripe. Set{' '}
          <span className="font-mono">STRIPE_SECRET_KEY</span> and{' '}
          <span className="font-mono">STRIPE_WEBHOOK_SECRET</span> first.
        </div>
      )}
      {platformReady && (
        <div className="mt-3 space-y-2">
          {flash && <div className="text-[12px] text-ink-mute">{flash}</div>}
          {status.error && <div className="text-[12px] text-danger">{status.error.message}</div>}
          {connect.error && <div className="text-[12px] text-danger">{connect.error.message}</div>}
          <div className="text-[12px] text-ink-mute">
            {chargesEnabled
              ? 'USD payments settle directly to your Stripe account.'
              : "Until you connect, USD payments settle to the platform's Stripe account."}
          </div>
          {isAdmin ? (
            <Button onClick={start} disabled={connect.isPending} variant="outline" size="sm">
              {connect.isPending
                ? 'Redirecting…'
                : chargesEnabled
                  ? 'Re-open Stripe dashboard'
                  : accountId
                    ? 'Resume Stripe onboarding'
                    : 'Connect Stripe account'}
            </Button>
          ) : (
            <div className="text-[12px] text-ink-soft">
              Only owners and admins can connect Stripe.
            </div>
          )}
          {accountId && (
            <div className="text-[11px] text-ink-soft font-mono">acct: {accountId}</div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({
  name,
  subtitle,
  badge,
  children,
}: {
  name: string;
  subtitle: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[15px] font-medium text-ink">{name}</div>
        {badge}
      </div>
      <div className="text-[12px] text-ink-mute">{subtitle}</div>
      {children}
    </div>
  );
}
