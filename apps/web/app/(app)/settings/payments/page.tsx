// Per-region payment routing: services in INR → Cashfree, everything else
// → Stripe. Payouts go to the **tenant's own account** once onboarding is
// complete — Stripe Connect (chargesEnabled) or a Cashfree Easy Split
// vendor (ACTIVE). Until then we fall back to the platform account.

import { getServerEnv } from '@udyamflow/env/server';
import { CashfreePayoutCard } from '@/components/payments/cashfree-payout-card';
import { StripeConnectCard } from '@/components/payments/stripe-connect-card';

const STRIPE_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'charge.refunded',
];
// Only needed when the tenant uses built-in Stripe invoicing.
const STRIPE_INVOICE_EVENTS = [
  'invoice.paid',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'invoice.finalized',
];

export default function PaymentsSettingsPage() {
  // Read at request time so on/off badges reflect deployed env, not build env.
  const env = getServerEnv();
  const stripeReady = !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;
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
          Cashfree, everything else (USD / EUR / GBP / …) via Stripe. Free services skip checkout
          entirely. Once you connect Stripe or register a payout account for Cashfree, customer
          payments settle directly to you; until then they settle to the platform account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-[860px]">
        <StripeConnectCard platformReady={stripeReady} />
        <CashfreePayoutCard />
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
            <div className="text-[12px] text-ink-mute mt-2">
              Using built-in Stripe invoicing? Also subscribe the Connect endpoint to{' '}
              <EventList events={STRIPE_INVOICE_EVENTS} />.
            </div>
          </div>
          <div>
            <div className="font-medium">Cashfree</div>
            <div className="font-mono mt-1">POST {appUrl}/api/payments/cashfree/webhook</div>
            <div className="text-[12px] text-ink-mute mt-1">
              Set this as the payment webhook in the platform's Cashfree dashboard (payouts to your
              account happen through Easy Split). Every request is signature-verified with{' '}
              <span className="font-mono">CASHFREE_CLIENT_SECRET</span> before a booking is updated.
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
