'use client';

import type { TenantTheme } from '@udyamflow/tokens';
import { Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';
import { formatCadence, formatMoney } from './format';

type PublicPlan = {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  interval: string;
  intervalCount: number;
  sessionsPerCycle: number | null;
};

export function MembershipSignup({
  orgSlug,
  theme,
  plans,
}: {
  orgSlug: string;
  theme: TenantTheme;
  plans: PublicPlan[];
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const subscribe = trpc.membership.subscribe.useMutation();
  const plan = plans.find((p) => p.id === planId) ?? null;
  const payable = plan?.currency.toUpperCase() === 'INR';

  const canSubmit =
    !!plan &&
    payable &&
    name.trim().length >= 2 &&
    email.includes('@') &&
    phone.replace(/\D/g, '').length >= 10 &&
    !subscribe.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setError(null);
    try {
      const res = await subscribe.mutateAsync({
        orgSlug,
        planId: plan.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      window.location.href = res.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <div className="grid gap-3 sm:grid-cols-2 content-start">
        {plans.map((p) => {
          const selected = p.id === planId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlanId(p.id)}
              aria-pressed={selected}
              className="text-left p-5 border transition-colors"
              style={{
                borderRadius: theme.radius,
                borderColor: selected ? theme.accent : 'var(--color-border)',
                background: selected ? `${theme.accent}10` : 'var(--color-surface)',
              }}
            >
              <div className="text-[15px] font-medium text-ink">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span
                  className="text-[24px] font-semibold text-ink tabular-nums"
                  style={{ fontFamily: theme.fontDisplay }}
                >
                  {formatMoney(p.amountCents, p.currency)}
                </span>
                <span className="text-[12px] text-ink-mute">
                  {formatCadence(p.interval, p.intervalCount)}
                </span>
              </div>
              {p.sessionsPerCycle && (
                <div className="mt-1 text-[12px] text-ink-mute">
                  {p.sessionsPerCycle} session{p.sessionsPerCycle === 1 ? '' : 's'} per{' '}
                  {p.intervalCount > 1 ? `${p.intervalCount} ${p.interval}s` : p.interval}
                </div>
              )}
              {p.description && (
                <p className="mt-3 text-[13px] text-ink-mute leading-relaxed whitespace-pre-line">
                  {p.description}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={onSubmit}
        className="p-5 border border-border h-fit grid gap-3"
        style={{ borderRadius: theme.radius, background: 'var(--color-surface)' }}
      >
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono">
          Your details
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-name">Name</Label>
          <Input
            id="m-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-email">Email</Label>
          <Input
            id="m-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-phone">Mobile number</Label>
          <Input
            id="m-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="text-[11px] text-ink-soft">
            Must be the number linked to your bank / UPI — mandate alerts go here.
          </div>
        </div>
        {plan && !payable && (
          <div className="text-[12px] text-ink-mute">
            This plan is priced in {plan.currency}; online sign-up supports INR plans only.
          </div>
        )}
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 py-2.5 text-white text-[13px] font-medium disabled:opacity-50"
          style={{ background: theme.accent, borderRadius: theme.radius }}
        >
          {subscribe.isPending
            ? 'Setting up…'
            : plan
              ? `Subscribe · ${formatMoney(plan.amountCents, plan.currency)} ${formatCadence(plan.interval, plan.intervalCount)}`
              : 'Subscribe'}
        </button>
        <div className="text-[11px] text-ink-soft leading-relaxed">
          You'll approve the mandate on Cashfree's secure page. Your bank debits the same amount
          each cycle until you cancel.
        </div>
      </form>
    </div>
  );
}
