// Per-region payment routing: services in INR → Cashfree, USD → Stripe.
// Stripe payouts go to the **tenant's own Connect account** once onboarding
// is complete (chargesEnabled); Cashfree payouts go to the tenant's own
// Cashfree account when they've saved credentials. Otherwise both fall back
// to the platform account so nothing breaks.

import { getServerEnv } from '@udyamflow/env/server';
import { CashfreeCard } from '@/components/payments/cashfree-card';
import { StripeConnectCard } from '@/components/payments/stripe-connect-card';

const STRIPE_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'charge.refunded',
];

export default function PaymentsSettingsPage() {
  // Read at request time so on/off badges reflect deployed env, not build env.
  const env = getServerEnv();
  const stripeReady = !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;
  const cashfreeReady = !!env.CASHFREE_CLIENT_ID && !!env.CASHFREE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Payments
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Payment gateways</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          UdyamFlow routes by service currency: <strong>INR</strong> services check out via
          Cashfree, <strong>USD</strong> services via Stripe. Free services skip checkout entirely.
          Once you connect Stripe or save your Cashfree credentials, customer payments settle
          directly to your own account; until then they settle to the platform account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-[860px]">
        <StripeConnectCard platformReady={stripeReady} />
        <CashfreeCard
          platformReady={cashfreeReady}
          missing={
            [
              !env.CASHFREE_CLIENT_ID && 'CASHFREE_CLIENT_ID',
              !env.CASHFREE_CLIENT_SECRET && 'CASHFREE_CLIENT_SECRET',
            ].filter(Boolean) as string[]
          }
        />
      </div>

      <div className="mt-8 bg-surface border border-border rounded-xl p-5 max-w-[860px]">
        <div className="text-[12px] uppercase tracking-wider font-mono text-ink-soft mb-2">
          Webhook endpoints
        </div>
        <div className="text-[13px] text-ink space-y-4">
          <div>
            <div className="font-medium">Stripe — two endpoints, same URL</div>
            <div className="font-mono mt-1">POST {appUrl}/api/payments/stripe/webhook</div>
            <ol className="text-[12px] text-ink-mute mt-2 space-y-1.5 list-decimal pl-5">
              <li>
                <strong className="text-ink">Platform endpoint</strong> ("Events on your account"):{' '}
                <EventList events={STRIPE_EVENTS} />. Put its signing secret in{' '}
                <span className="font-mono">STRIPE_WEBHOOK_SECRET</span>.
              </li>
              <li>
                <strong className="text-ink">Connect endpoint</strong> ("Events on connected
                accounts"): the same events plus <span className="font-mono">account.updated</span>.
                Put its signing secret in{' '}
                <span className="font-mono">STRIPE_CONNECT_WEBHOOK_SECRET</span>.
              </li>
            </ol>
          </div>
          <div>
            <div className="font-medium">Cashfree</div>
            <div className="font-mono mt-1">POST {appUrl}/api/payments/cashfree/webhook</div>
            <div className="text-[12px] text-ink-mute mt-1">
              Set this as the payment webhook in the Cashfree dashboard of every account that takes
              payments (the platform's and, if you saved your own credentials, yours). Every request
              is signature-verified before a booking is updated.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventList({ events }: { events: string[] }) {
  return (
    <>
      {events.map((e, i) => (
        <span key={e}>
          {i > 0 ? ', ' : ''}
          <span className="font-mono">{e}</span>
        </span>
      ))}
    </>
  );
}
