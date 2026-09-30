// Per-region payment routing: services in INR → Cashfree, everything else
// → Stripe. Stripe payouts go to the **tenant's own Connect account** once
// onboarding is complete (chargesEnabled). Until then we fall back to the
// platform account so nothing breaks.

import { getServerEnv } from '@udyamflow/env/server';
import { StripeConnectCard } from '@/components/payments/stripe-connect-card';

export default function PaymentsSettingsPage() {
  // Read at request time so on/off badges reflect deployed env, not build env.
  const env = getServerEnv();
  const stripeReady = !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;
  const cashfreeReady = !!env.CASHFREE_CLIENT_ID && !!env.CASHFREE_CLIENT_SECRET;

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Payments
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Payment gateways</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          UdyamFlow routes by service currency: <strong>INR</strong> services check out via
          Cashfree, everything else (USD / EUR / GBP / …) via Stripe. Free services skip checkout
          entirely. Once connected, customer payments settle directly to your own Stripe / Cashfree
          account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-[860px]">
        <StripeConnectCard platformReady={stripeReady} />
        <GatewayCard
          name="Cashfree"
          subtitle="India · INR"
          ready={cashfreeReady}
          missing={
            [
              !env.CASHFREE_CLIENT_ID && 'CASHFREE_CLIENT_ID',
              !env.CASHFREE_CLIENT_SECRET && 'CASHFREE_CLIENT_SECRET',
            ].filter(Boolean) as string[]
          }
          docsUrl="https://docs.cashfree.com/docs/pg-new"
        />
      </div>

      <div className="mt-8 bg-surface border border-border rounded-xl p-5 max-w-[860px]">
        <div className="text-[12px] uppercase tracking-wider font-mono text-ink-soft mb-2">
          Webhook endpoints
        </div>
        <div className="text-[13px] font-mono text-ink space-y-1">
          <div>POST {process.env.NEXT_PUBLIC_APP_URL}/api/payments/stripe/webhook</div>
          <div>POST {process.env.NEXT_PUBLIC_APP_URL}/api/payments/cashfree/webhook</div>
        </div>
        <div className="text-[12px] text-ink-mute mt-2">
          Configure these in your gateway dashboard. The signing secret in your env
          (STRIPE_WEBHOOK_SECRET / CASHFREE_CLIENT_SECRET) is what verifies the request. For Stripe
          Connect, also enable the <span className="font-mono">account.updated</span> event, plus{' '}
          <span className="font-mono">invoice.paid</span> /{' '}
          <span className="font-mono">invoice.voided</span> if you use Stripe invoicing.
        </div>
      </div>
    </div>
  );
}

function GatewayCard({
  name,
  subtitle,
  ready,
  missing,
  docsUrl,
}: {
  name: string;
  subtitle: string;
  ready: boolean;
  missing: string[];
  docsUrl: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[15px] font-medium text-ink">{name}</div>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: ready ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
            color: ready ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
          }}
        >
          {ready ? 'Connected' : 'Not configured'}
        </span>
      </div>
      <div className="text-[12px] text-ink-mute">{subtitle}</div>
      {!ready && missing.length > 0 && (
        <div className="mt-3 text-[12px] text-ink-mute">
          Set in your environment:
          <div className="mt-1 flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <span
                key={m}
                className="text-[11px] px-2 py-0.5 rounded font-mono bg-surface-mute text-ink"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-[12px] text-ink-mute hover:text-ink underline-offset-2 hover:underline"
      >
        Setup docs →
      </a>
    </div>
  );
}
