'use client';

// Choose where booking invoices are issued:
//   • Stripe Invoicing — built in, runs on the tenant's Stripe Connect account
//   • FreshBooks — first accounting integration, connected via OAuth
// QuickBooks / Xero / Zoho Books are listed as upcoming integrations.

import { Button } from '@udyamflow/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

type Provider = 'none' | 'stripe' | 'freshbooks';

const UPCOMING = [
  {
    name: 'QuickBooks Online',
    blurb: 'Most-used small-business ledger in the US, UK, CA and AU.',
  },
  {
    name: 'Xero',
    blurb: 'Popular with accountants in the UK, AU and NZ.',
  },
  {
    name: 'Zoho Books',
    blurb: 'GST-compliant invoices and e-invoicing for India.',
  },
];

export default function InvoicingSettingsPage() {
  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Invoicing
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Invoicing</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[640px]">
          Issue an invoice for every booking — from the bookings list, or automatically once a
          customer pays. Use Stripe's built-in invoicing, or send invoices straight into your
          accounting software.
        </p>
      </div>
      <Suspense fallback={null}>
        <InvoicingSettings />
      </Suspense>
    </div>
  );
}

function InvoicingSettings() {
  const utils = trpc.useUtils();
  const status = trpc.invoicing.status.useQuery();
  const update = trpc.invoicing.updateSettings.useMutation({
    onSuccess: () => utils.invoicing.status.invalidate(),
  });
  const connect = trpc.invoicing.connectFreshbooks.useMutation();
  const disconnect = trpc.invoicing.disconnectFreshbooks.useMutation({
    onSuccess: () => utils.invoicing.status.invalidate(),
  });

  const search = useSearchParams();
  const [flash, setFlash] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  useEffect(() => {
    const fb = search.get('freshbooks');
    if (fb === 'connected') setFlash({ tone: 'good', text: 'FreshBooks connected.' });
    if (fb === 'error') {
      setFlash({
        tone: 'bad',
        text: `FreshBooks connection failed: ${search.get('reason') ?? 'unknown error'}`,
      });
    }
  }, [search]);

  const s = status.data;
  const provider: Provider = s?.provider ?? 'none';
  const error = update.error ?? connect.error ?? disconnect.error;

  async function startFreshbooks() {
    const res = await connect.mutateAsync();
    window.location.assign(res.url);
  }

  return (
    <div className="max-w-[860px] space-y-6">
      {flash && (
        <div
          className="text-[13px] px-4 py-2.5 rounded-lg border border-border"
          style={{ color: flash.tone === 'good' ? 'var(--accent-ink)' : 'var(--color-danger)' }}
        >
          {flash.text}
        </div>
      )}
      {error && <div className="text-[13px] text-danger">{error.message}</div>}

      <div className="grid grid-cols-2 gap-4">
        <ProviderCard
          name="FreshBooks"
          subtitle="Accounting integration · recommended"
          selected={provider === 'freshbooks'}
          badge={
            !s?.freshbooks.available
              ? 'Not configured'
              : s.freshbooks.connected
                ? 'Connected'
                : 'Not connected'
          }
          good={!!s?.freshbooks.connected}
          onSelect={
            s?.freshbooks.connected ? () => update.mutate({ provider: 'freshbooks' }) : undefined
          }
          disabled={update.isPending}
        >
          <p>
            Clients, invoices and payments sync into your FreshBooks books. Paid bookings are
            recorded as paid; unpaid ones are emailed by FreshBooks.
          </p>
          {!s?.freshbooks.available ? (
            <EnvHint vars={['FRESHBOOKS_CLIENT_ID', 'FRESHBOOKS_CLIENT_SECRET']} />
          ) : s.freshbooks.connected ? (
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[12px] text-ink">{s.freshbooks.businessName}</span>
              <button
                type="button"
                className="text-[12px] text-ink-mute hover:text-danger"
                disabled={disconnect.isPending}
                onClick={() => {
                  if (confirm('Disconnect FreshBooks? Existing invoices stay in FreshBooks.')) {
                    disconnect.mutate();
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={startFreshbooks}
              disabled={connect.isPending}
            >
              {connect.isPending ? 'Redirecting…' : 'Connect FreshBooks'}
            </Button>
          )}
        </ProviderCard>

        <ProviderCard
          name="Stripe Invoicing"
          subtitle="Built in · no extra account"
          selected={provider === 'stripe'}
          badge={
            !s?.stripe.available ? 'Not configured' : s.stripe.ready ? 'Ready' : 'Needs Stripe'
          }
          good={!!s?.stripe.ready}
          onSelect={s?.stripe.ready ? () => update.mutate({ provider: 'stripe' }) : undefined}
          disabled={update.isPending}
        >
          <p>
            Branded invoices and a hosted pay page from your connected Stripe account. Stripe
            charges a small per-invoice fee on paid invoices.
          </p>
          {s?.stripe.available && !s.stripe.ready && (
            <Link
              href="/settings/payments"
              className="mt-3 inline-block text-[12px] text-ink underline-offset-2 hover:underline"
            >
              Connect Stripe in Payments →
            </Link>
          )}
        </ProviderCard>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <label className="flex items-center justify-between text-[13px] text-ink">
          <span>
            Automatically invoice bookings when they're paid
            <span className="block text-[12px] text-ink-mute">
              The invoice is marked paid and emailed to the customer as a receipt.
            </span>
          </span>
          <input
            type="checkbox"
            checked={s?.autoInvoice ?? false}
            disabled={provider === 'none' || update.isPending}
            onChange={(e) => update.mutate({ autoInvoice: e.target.checked })}
          />
        </label>
        {provider !== 'none' && (
          <button
            type="button"
            className="text-[12px] text-ink-mute hover:text-ink"
            disabled={update.isPending}
            onClick={() => update.mutate({ provider: 'none', autoInvoice: false })}
          >
            Turn off invoicing
          </button>
        )}
      </div>

      <div>
        <div className="text-[12px] uppercase tracking-wider font-mono text-ink-soft mb-3">
          More integrations — coming soon
        </div>
        <div className="grid grid-cols-3 gap-4">
          {UPCOMING.map((u) => (
            <div key={u.name} className="bg-surface border border-border rounded-xl p-4 opacity-70">
              <div className="text-[14px] font-medium text-ink">{u.name}</div>
              <div className="text-[12px] text-ink-mute mt-1">{u.blurb}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  name,
  subtitle,
  selected,
  badge,
  good,
  onSelect,
  disabled,
  children,
}: {
  name: string;
  subtitle: string;
  selected: boolean;
  badge: string;
  good: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-surface border rounded-xl p-5"
      style={{ borderColor: selected ? 'var(--accent)' : 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[15px] font-medium text-ink">{name}</div>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: good ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
            color: good ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
          }}
        >
          {badge}
        </span>
      </div>
      <div className="text-[12px] text-ink-mute">{subtitle}</div>
      <div className="text-[13px] text-ink-mute mt-3">{children}</div>
      <div className="mt-4">
        {selected ? (
          <span className="text-[12px] font-medium" style={{ color: 'var(--accent-ink)' }}>
            ✓ Issuing invoices here
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={onSelect} disabled={!onSelect || disabled}>
            Use for invoices
          </Button>
        )}
      </div>
    </div>
  );
}

function EnvHint({ vars }: { vars: string[] }) {
  return (
    <div className="mt-3 text-[12px] text-ink-mute">
      Set in your environment:
      <div className="mt-1 flex flex-wrap gap-1.5">
        {vars.map((v) => (
          <span
            key={v}
            className="text-[11px] px-2 py-0.5 rounded font-mono bg-surface-mute text-ink"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
