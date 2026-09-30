'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';

// Cashfree Easy Split onboarding. Registers the tenant's bank account or
// UPI ID as a Cashfree vendor so INR booking payments settle to them
// directly. Sits next to the Stripe Connect card on /settings/payments.

const ACCOUNT_TYPES = [
  'Individual',
  'Proprietorship',
  'Partnership',
  'Private Limited',
  'Public Limited',
  'LLP',
  'Trust',
  'Society',
];

const BUSINESS_TYPE_BY_PROFESSION: Record<string, string> = {
  doctor: 'Healthcare',
  therapist: 'Healthcare',
  teacher: 'Education',
  fitness: 'Sports and Fitness',
  sports: 'Sports and Fitness',
  salon: 'Beauty and Wellness',
};

const selectCls = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink';

export function CashfreePayoutCard() {
  const utils = trpc.useUtils();
  const status = trpc.payment.cashfreeStatus.useQuery({ refresh: true });
  const settings = trpc.tenant.getSettings.useQuery();
  const connect = trpc.payment.connectCashfree.useMutation({
    onSuccess: () => utils.payment.cashfreeStatus.invalidate(),
  });
  const [open, setOpen] = useState(false);

  const s = status.data;
  const vendorStatus = s?.status ?? null;
  let badge: { label: string; good: boolean } = { label: 'Not connected', good: false };
  if (s && !s.configured) badge = { label: 'Not configured', good: false };
  else if (vendorStatus === 'ACTIVE') badge = { label: 'Payouts active', good: true };
  else if (vendorStatus)
    badge = { label: vendorStatus.replaceAll('_', ' ').toLowerCase(), good: false };

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[15px] font-medium text-ink">Cashfree</div>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: badge.good ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
            color: badge.good ? 'var(--accent-ink)' : 'var(--color-ink-mute)',
          }}
        >
          {badge.label}
        </span>
      </div>
      <div className="text-[12px] text-ink-mute">India · INR · UPI, cards, netbanking</div>

      {s && !s.configured && (
        <div className="mt-3 text-[12px] text-ink-mute">
          Server isn't configured for Cashfree. Set{' '}
          <span className="font-mono">CASHFREE_CLIENT_ID</span> and{' '}
          <span className="font-mono">CASHFREE_CLIENT_SECRET</span> first.
        </div>
      )}

      {s?.configured && s.vendorId && (
        <div className="mt-3 space-y-1 text-[12px] text-ink-mute">
          <div>
            Payouts to <span className="font-mono text-ink">{s.payoutLabel}</span>
          </div>
          {vendorStatus !== 'ACTIVE' && (
            <div>
              Cashfree is verifying your account. Until it's active, INR payments settle to the
              platform account.
              {s.remarks && <span className="block mt-1">Cashfree: {s.remarks}</span>}
            </div>
          )}
          <button
            type="button"
            className="text-ink-mute hover:text-ink"
            onClick={() => utils.payment.cashfreeStatus.invalidate()}
          >
            Refresh status
          </button>
        </div>
      )}

      {s?.configured && !s.vendorId && !open && (
        <div className="mt-3 space-y-2">
          <div className="text-[12px] text-ink-mute">
            Add your bank account or UPI ID so customer payments settle straight to you.
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Set up payouts
          </Button>
        </div>
      )}

      {s?.configured && !s.vendorId && open && (
        <PayoutForm
          defaultBusinessType={
            BUSINESS_TYPE_BY_PROFESSION[settings.data?.profession ?? ''] ?? 'Others'
          }
          pending={connect.isPending}
          error={connect.error?.message ?? null}
          onSubmit={(v) => connect.mutate(v)}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

type FormValues = Parameters<
  ReturnType<typeof trpc.payment.connectCashfree.useMutation>['mutate']
>[0];

function PayoutForm({
  defaultBusinessType,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  defaultBusinessType: string;
  pending: boolean;
  error: string | null;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<'bank' | 'upi'>('bank');
  const [f, setF] = useState({
    name: '',
    email: '',
    phone: '',
    accountHolder: '',
    accountNumber: '',
    ifsc: '',
    vpa: '',
    pan: '',
    gstin: '',
    accountType: 'Individual',
    businessType: defaultBusinessType,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: f.name.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      payout:
        kind === 'bank'
          ? {
              kind,
              accountHolder: f.accountHolder.trim(),
              accountNumber: f.accountNumber.replace(/\s/g, ''),
              ifsc: f.ifsc.trim().toUpperCase(),
            }
          : { kind, accountHolder: f.accountHolder.trim(), vpa: f.vpa.trim() },
      pan: f.pan.trim().toUpperCase(),
      gstin: f.gstin.trim() ? f.gstin.trim().toUpperCase() : undefined,
      accountType: f.accountType,
      businessType: f.businessType.trim(),
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Field id="cf-name" label="Business / owner name" value={f.name} onChange={set('name')} />
      <div className="grid grid-cols-2 gap-2">
        <Field id="cf-email" label="Email" value={f.email} onChange={set('email')} />
        <Field id="cf-phone" label="Mobile" value={f.phone} onChange={set('phone')} />
      </div>

      <div className="flex gap-4 text-[13px] text-ink">
        {(['bank', 'upi'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="radio" checked={kind === k} onChange={() => setKind(k)} />
            {k === 'bank' ? 'Bank account' : 'UPI ID'}
          </label>
        ))}
      </div>
      <Field
        id="cf-holder"
        label="Account holder name"
        value={f.accountHolder}
        onChange={set('accountHolder')}
      />
      {kind === 'bank' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field
            id="cf-acct"
            label="Account number"
            value={f.accountNumber}
            onChange={set('accountNumber')}
          />
          <Field id="cf-ifsc" label="IFSC" value={f.ifsc} onChange={set('ifsc')} />
        </div>
      ) : (
        <Field
          id="cf-vpa"
          label="UPI ID"
          value={f.vpa}
          onChange={set('vpa')}
          placeholder="name@bank"
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field id="cf-pan" label="PAN" value={f.pan} onChange={set('pan')} />
        <Field id="cf-gstin" label="GSTIN (optional)" value={f.gstin} onChange={set('gstin')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-atype">Entity type</Label>
          <select
            id="cf-atype"
            className={selectCls}
            value={f.accountType}
            onChange={set('accountType')}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <Field
          id="cf-btype"
          label="Business category"
          value={f.businessType}
          onChange={set('businessType')}
        />
      </div>

      {error && <div className="text-[12px] text-danger">{error}</div>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit to Cashfree'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="text-[11px] text-ink-soft">
        Bank details go directly to Cashfree for verification — UdyamFlow doesn't store them.
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
