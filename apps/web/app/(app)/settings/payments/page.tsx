// Per-region payment routing: services in INR → Cashfree, everything else
// → Stripe. Payouts go to the **tenant's own account** once onboarding is
// complete — Stripe Connect (chargesEnabled) or a Cashfree Easy Split
// vendor (ACTIVE). Until then we fall back to the platform account.

import { getServerEnv } from '@udyamflow/env/server';
import { CashfreePayoutCard } from '@/components/payments/cashfree-payout-card';
import { StripeConnectCard } from '@/components/payments/stripe-connect-card';

export default function PaymentsSettingsPage() {
  // Read at request time so on/off badges reflect deployed env, not build env.
  const env = getServerEnv();
  const stripeReady = !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;

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
        <CashfreePayoutCard />
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
