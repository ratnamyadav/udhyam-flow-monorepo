'use client';

// Choose where booking invoices are issued:
//   • UdyamFlow GST invoices — built in, numbered per financial year
//   • Zoho Books / FreshBooks — accounting integrations over OAuth
//   • Stripe Invoicing — on the tenant's Stripe Connect account
// Plus the tenant's GST profile and accountant exports (CSV / Tally).

import { GST_STATES } from '@udyamflow/api/gst';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

type OAuthProvider = 'freshbooks' | 'zoho_books';

const UPCOMING = [
  {
    name: 'QuickBooks Online',
    blurb: 'Most-used small-business ledger in the US, UK, CA and AU.',
  },
  {
    name: 'Xero',
    blurb: 'Popular with accountants in the UK, AU and NZ.',
  },
];

const selectCls = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink';

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
          customer pays. Use UdyamFlow's GST invoices, Stripe, or send invoices straight into your
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
  const connect = trpc.invoicing.connect.useMutation();
  const disconnect = trpc.invoicing.disconnect.useMutation({
    onSuccess: () => utils.invoicing.status.invalidate(),
  });

  const search = useSearchParams();
  const [flash, setFlash] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  useEffect(() => {
    for (const [key, label] of [
      ['freshbooks', 'FreshBooks'],
      ['zoho', 'Zoho Books'],
    ] as const) {
      const v = search.get(key);
      if (v === 'connected') setFlash({ tone: 'good', text: `${label} connected.` });
      if (v === 'error') {
        setFlash({
          tone: 'bad',
          text: `${label} connection failed: ${search.get('reason') ?? 'unknown error'}`,
        });
      }
    }
  }, [search]);

  const s = status.data;
  const provider = s?.provider ?? 'none';
  const error = update.error ?? connect.error ?? disconnect.error;

  async function startConnect(p: OAuthProvider) {
    const res = await connect.mutateAsync({ provider: p });
    window.location.assign(res.url);
  }

  function oauthBody(p: OAuthProvider, label: string, envVars: string[]) {
    const info = p === 'freshbooks' ? s?.freshbooks : s?.zoho;
    if (!info?.available) return <EnvHint vars={envVars} />;
    if (info.connected) {
      return (
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[12px] text-ink">{info.businessName}</span>
          <button
            type="button"
            className="text-[12px] text-ink-mute hover:text-danger"
            disabled={disconnect.isPending}
            onClick={() => {
              if (confirm(`Disconnect ${label}? Existing invoices stay in ${label}.`)) {
                disconnect.mutate({ provider: p });
              }
            }}
          >
            Disconnect
          </button>
        </div>
      );
    }
    return (
      <Button
        className="mt-3"
        variant="outline"
        size="sm"
        onClick={() => startConnect(p)}
        disabled={connect.isPending}
      >
        {connect.isPending && connect.variables?.provider === p
          ? 'Redirecting…'
          : `Connect ${label}`}
      </Button>
    );
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
          name="UdyamFlow GST invoices"
          subtitle="Built in · free · recommended for India"
          selected={provider === 'udyamflow'}
          badge="Ready"
          good
          onSelect={() => update.mutate({ provider: 'udyamflow' })}
          disabled={update.isPending}
        >
          <p>
            Tax invoices (CGST/SGST or IGST) or Bills of Supply, numbered per financial year, with a
            shareable, printable page. Fill in your GST profile below.
          </p>
        </ProviderCard>

        <ProviderCard
          name="Zoho Books"
          subtitle="Accounting · GST-native"
          selected={provider === 'zoho_books'}
          badge={
            !s?.zoho.available ? 'Not configured' : s.zoho.connected ? 'Connected' : 'Not connected'
          }
          good={!!s?.zoho.connected}
          onSelect={s?.zoho.connected ? () => update.mutate({ provider: 'zoho_books' }) : undefined}
          disabled={update.isPending}
        >
          <p>
            Contacts, GST invoices and payments land in your Zoho Books organization — ready for
            GSTR-1 filing from Zoho.
          </p>
          {oauthBody('zoho_books', 'Zoho Books', ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'])}
        </ProviderCard>

        <ProviderCard
          name="FreshBooks"
          subtitle="Accounting · US / CA / UK"
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
          {oauthBody('freshbooks', 'FreshBooks', [
            'FRESHBOOKS_CLIENT_ID',
            'FRESHBOOKS_CLIENT_SECRET',
          ])}
        </ProviderCard>

        <ProviderCard
          name="Stripe Invoicing"
          subtitle="Built in · global"
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

      <GstProfileForm />
      <ExportPanel />

      <div>
        <div className="text-[12px] uppercase tracking-wider font-mono text-ink-soft mb-3">
          More integrations — coming soon
        </div>
        <div className="grid grid-cols-2 gap-4">
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

function GstProfileForm() {
  const utils = trpc.useUtils();
  const profile = trpc.invoicing.gstProfile.useQuery();
  const save = trpc.invoicing.updateGstProfile.useMutation({
    onSuccess: () => {
      utils.invoicing.gstProfile.invalidate();
      setSaved(true);
    },
  });
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    gstRegistered: false,
    gstin: '',
    legalName: '',
    stateCode: '',
    billingAddress: '',
    invoicePrefix: 'INV',
    // 'inherit' → platform default; 'custom' → `threshold` (₹, '' or 0 =
    // GST on every transaction).
    thresholdMode: 'inherit' as 'inherit' | 'custom',
    threshold: '',
  });
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setF({
      gstRegistered: p.gstRegistered,
      gstin: p.gstin ?? '',
      legalName: p.legalName ?? '',
      stateCode: p.stateCode ?? '',
      billingAddress: p.billingAddress ?? '',
      invoicePrefix: p.invoicePrefix,
      thresholdMode: p.gstThresholdCents === null ? 'inherit' : 'custom',
      threshold: p.gstThresholdCents ? String(p.gstThresholdCents / 100) : '',
    });
  }, [profile.data]);
  const platformDefault = profile.data?.platformGstThresholdCents ?? null;

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setSaved(false);
    setF((p) => ({ ...p, [k]: e.target.value }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      gstRegistered: f.gstRegistered,
      gstin: f.gstRegistered && f.gstin.trim() ? f.gstin.trim() : null,
      legalName: f.legalName.trim() || null,
      stateCode: f.stateCode || null,
      billingAddress: f.billingAddress.trim() || null,
      invoicePrefix: f.invoicePrefix,
      gstThresholdCents:
        f.thresholdMode === 'inherit'
          ? null
          : Math.max(0, Math.round((Number(f.threshold) || 0) * 100)),
    });
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div>
        <div className="text-[15px] font-medium text-ink">GST profile</div>
        <div className="text-[12px] text-ink-mute mt-1">
          Printed on UdyamFlow invoices and used for Zoho Books. Not registered? Leave GST off —
          you'll issue Bills of Supply (registration is required above ₹20 lakh turnover for
          services in most states).
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={f.gstRegistered}
          onChange={(e) => {
            setSaved(false);
            setF((p) => ({ ...p, gstRegistered: e.target.checked }));
          }}
        />
        GST-registered
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gst-legal">Legal / trade name</Label>
          <Input id="gst-legal" value={f.legalName} onChange={set('legalName')} />
        </div>
        {f.gstRegistered ? (
          <div className="space-y-1.5">
            <Label htmlFor="gst-gstin">GSTIN</Label>
            <Input
              id="gst-gstin"
              value={f.gstin}
              onChange={set('gstin')}
              placeholder="27AAPFU0939F1ZV"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="gst-state">State</Label>
            <select
              id="gst-state"
              className={selectCls}
              value={f.stateCode}
              onChange={set('stateCode')}
            >
              <option value="">Outside India / not applicable</option>
              {Object.entries(GST_STATES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gst-addr">Billing address</Label>
        <textarea
          id="gst-addr"
          rows={2}
          className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
          value={f.billingAddress}
          onChange={set('billingAddress')}
        />
      </div>
      <div className="w-40 space-y-1.5">
        <Label htmlFor="gst-prefix">Invoice prefix</Label>
        <Input
          id="gst-prefix"
          maxLength={4}
          value={f.invoicePrefix}
          onChange={set('invoicePrefix')}
        />
      </div>
      {f.gstRegistered && (
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-ink mb-1">When to charge GST</legend>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="radio"
              checked={f.thresholdMode === 'inherit'}
              onChange={() => {
                setSaved(false);
                setF((p) => ({ ...p, thresholdMode: 'inherit' }));
              }}
            />
            Use the UdyamFlow default (
            {platformDefault
              ? `only above ₹${(platformDefault / 100).toLocaleString('en-IN')}`
              : 'every transaction'}
            )
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="radio"
              checked={f.thresholdMode === 'custom'}
              onChange={() => {
                setSaved(false);
                setF((p) => ({ ...p, thresholdMode: 'custom' }));
              }}
            />
            Only on transactions above ₹
            <Input
              aria-label="GST threshold in rupees"
              type="number"
              min={0}
              step={1}
              className="w-28 h-8"
              value={f.threshold}
              disabled={f.thresholdMode !== 'custom'}
              onChange={set('threshold')}
              placeholder="0"
            />
          </label>
          <div className="text-[11px] text-ink-soft">
            0 = every transaction. Bookings at or below the limit get a Bill of Supply with no GST.
            A GST-registered business normally owes GST on every taxable sale — confirm with your CA
            before using a limit.
          </div>
        </fieldset>
      )}
      {save.error && <div className="text-[12px] text-danger">{save.error.message}</div>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save GST profile'}
        </Button>
        {saved && <span className="text-[12px] text-ink-mute">Saved.</span>}
      </div>
      <div className="text-[11px] text-ink-soft">
        Set each service's SAC code and GST rate in Settings → Services. Prices are treated as
        GST-inclusive.
      </div>
    </form>
  );
}

// Current Indian financial year as default export window.
function fyStart(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-04-01`;
}

function ExportPanel() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [ledgers, setLedgers] = useState({
    sales: 'Sales - Services',
    cgst: 'Output CGST',
    sgst: 'Output SGST',
    igst: 'Output IGST',
    receipts: 'Payment Gateway',
  });
  const [showLedgers, setShowLedgers] = useState(false);

  const href = (format: 'csv' | 'tally') => {
    const q = new URLSearchParams({ format, from, to, ...(format === 'tally' ? ledgers : {}) });
    return `/api/export/invoices?${q.toString()}`;
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div>
        <div className="text-[15px] font-medium text-ink">Export for your accountant</div>
        <div className="text-[12px] text-ink-mute mt-1">
          CSV with GST columns (for GSTR-1 / Excel), or Tally XML to import into TallyPrime via
          Gateway of Tally → Import → Transactions.
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ex-from">From</Label>
          <Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ex-to">To</Label>
          <Input id="ex-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <a href={href('csv')}>
          <Button type="button" variant="outline" size="md">
            Download CSV
          </Button>
        </a>
        <a href={href('tally')}>
          <Button type="button" variant="outline" size="md">
            Download Tally XML
          </Button>
        </a>
      </div>
      <button
        type="button"
        className="text-[12px] text-ink-mute hover:text-ink"
        onClick={() => setShowLedgers((v) => !v)}
      >
        {showLedgers ? 'Hide' : 'Edit'} Tally ledger names
      </button>
      {showLedgers && (
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(ledgers) as (keyof typeof ledgers)[]).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`led-${k}`}>
                {k === 'receipts' ? 'Payments received into' : `${k.toUpperCase()} ledger`}
              </Label>
              <Input
                id={`led-${k}`}
                value={ledgers[k]}
                onChange={(e) => setLedgers((p) => ({ ...p, [k]: e.target.value }))}
              />
            </div>
          ))}
          <div className="col-span-3 text-[11px] text-ink-soft">
            These ledgers must already exist in Tally. Customer ledgers are created under Sundry
            Debtors automatically.
          </div>
        </div>
      )}
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
