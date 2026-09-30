'use client';

import { Button, Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';
import { formatCadence, formatMoney, statusLabel } from './format';

type Interval = 'week' | 'month' | 'year';
const TERMINAL = new Set(['cancelled', 'completed', 'expired', 'failed']);

function StatusBadge({ status }: { status: string }) {
  const good = status === 'active';
  const bad = TERMINAL.has(status) || status === 'on_hold';
  return (
    <span
      className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded whitespace-nowrap"
      style={{
        background: good ? 'var(--accent-soft)' : 'var(--color-surface-mute)',
        color: good ? 'var(--accent-ink)' : bad ? 'var(--color-danger)' : 'var(--color-ink-mute)',
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

export function MembershipsSettings({
  missingEnv,
  webhookUrl,
  publicUrl,
}: {
  missingEnv: string[];
  webhookUrl: string;
  publicUrl: string | null;
}) {
  const utils = trpc.useUtils();
  const plans = trpc.membership.listPlans.useQuery();
  const subs = trpc.membership.listSubscriptions.useQuery();
  const create = trpc.membership.createPlan.useMutation({
    onSuccess: () => utils.membership.listPlans.invalidate(),
  });
  const update = trpc.membership.updatePlan.useMutation({
    onSuccess: () => utils.membership.listPlans.invalidate(),
  });
  const cancel = trpc.membership.cancelSubscription.useMutation({
    onSuccess: () => utils.membership.listSubscriptions.invalidate(),
    onError: (e) => alert(e.message),
  });

  const [name, setName] = useState('');
  const [price, setPrice] = useState(2000);
  const [interval, setBillingInterval] = useState<Interval>('month');
  const [intervalCount, setIntervalCount] = useState(1);
  const [sessions, setSessions] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(
    null,
  );

  async function onCreate() {
    setError(null);
    if (name.trim().length < 2) return setError('Name is required');
    if (!(price >= 1)) return setError('Price must be at least ₹1');
    await create
      .mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        amountCents: Math.round(price * 100),
        currency: 'INR',
        interval,
        intervalCount,
        sessionsPerCycle: sessions ? Number(sessions) : null,
      })
      .then(() => {
        setName('');
        setDescription('');
        setSessions('');
      })
      .catch((e: Error) => setError(e.message));
  }

  async function onSaveEdit() {
    if (!editing) return;
    await update
      .mutateAsync({ id: editing.id, name: editing.name, description: editing.description })
      .then(() => setEditing(null))
      .catch((e: Error) => alert(e.message));
  }

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Settings · Memberships
        </div>
        <h1 className="text-[32px] font-medium tracking-tight text-ink">Memberships</h1>
        <p className="text-[14px] text-ink-mute mt-2 max-w-[680px]">
          Sell recurring packages like “₹2,000 / month”. Customers approve a one-time UPI Autopay,
          eNACH or card mandate through Cashfree and are debited automatically every cycle.
          {publicUrl && (
            <>
              {' '}
              Share your sign-up page:{' '}
              <a href={publicUrl} target="_blank" rel="noreferrer" className="underline text-ink">
                {publicUrl.replace(/^https?:\/\//, '')}
              </a>
            </>
          )}
        </p>
      </div>

      {missingEnv.length > 0 && (
        <div className="mb-6 bg-surface border border-border rounded-xl p-5 max-w-[860px]">
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-medium text-ink">Cashfree Subscriptions</div>
            <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-surface-mute text-ink-mute">
              Not configured
            </span>
          </div>
          <div className="mt-2 text-[12px] text-ink-mute">
            You can set up plans now, but customers can't subscribe until these are set in your
            environment:
            <div className="mt-1 flex flex-wrap gap-1.5">
              {missingEnv.map((m) => (
                <span
                  key={m}
                  className="text-[11px] px-2 py-0.5 rounded font-mono bg-surface-mute text-ink"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <div className="bg-surface border border-border rounded-xl h-fit">
          {plans.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : plans.data && plans.data.length > 0 ? (
            plans.data.map((p) => (
              <div
                key={p.id}
                className="px-5 py-4 border-t border-border first:border-t-0 grid grid-cols-[1fr_160px_150px] gap-4 items-start"
                style={{ opacity: p.active ? 1 : 0.6 }}
              >
                <div>
                  {editing?.id === p.id ? (
                    <div className="grid gap-2">
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      />
                      <textarea
                        className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
                        rows={2}
                        value={editing.description}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={onSaveEdit} disabled={update.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-ink">{p.name}</span>
                        {!p.active && (
                          <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-surface-mute text-ink-mute">
                            Inactive
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <div className="text-[12px] text-ink-mute">{p.description}</div>
                      )}
                      {p.sessionsPerCycle && (
                        <div className="text-[12px] text-ink-mute">
                          {p.sessionsPerCycle} sessions per cycle
                        </div>
                      )}
                      {p.cashfreePlanId && (
                        <div className="text-[11px] text-ink-soft mt-1">
                          Live at Cashfree — price and interval are locked.
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="text-[13px] font-mono text-ink">
                  {formatMoney(p.amountCents, p.currency)}{' '}
                  <span className="text-ink-mute">
                    {formatCadence(p.interval, p.intervalCount)}
                  </span>
                </div>
                <div className="text-right space-x-3">
                  {editing?.id !== p.id && (
                    <button
                      type="button"
                      className="text-[12px] text-ink-mute hover:text-ink"
                      onClick={() =>
                        setEditing({ id: p.id, name: p.name, description: p.description ?? '' })
                      }
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-[12px] text-ink-mute hover:text-ink"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: p.id, active: !p.active })}
                  >
                    {p.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-[13px] text-ink-mute">
              No membership plans yet — add one on the right.
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit">
          <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
            Add plan
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-name">Name</Label>
            <Input
              id="mp-name"
              placeholder="e.g. Monthly unlimited"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-price">Price (₹)</Label>
              <Input
                id="mp-price"
                type="number"
                min={1}
                step={50}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-sessions">Sessions / cycle</Label>
              <Input
                id="mp-sessions"
                type="number"
                min={1}
                placeholder="Optional"
                value={sessions}
                onChange={(e) => setSessions(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-every">Every</Label>
              <Input
                id="mp-every"
                type="number"
                min={1}
                max={12}
                value={intervalCount}
                onChange={(e) => setIntervalCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-interval">Interval</Label>
              <select
                id="mp-interval"
                className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
                value={interval}
                onChange={(e) => setBillingInterval(e.target.value as Interval)}
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mp-desc">Description</Label>
            <textarea
              id="mp-desc"
              rows={3}
              className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
              placeholder="What's included"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="text-[11px] text-ink-soft leading-relaxed">
            Price and interval are fixed once saved: Cashfree plans are immutable and customers
            approve mandates for that exact amount. To re-price, create a new plan and deactivate
            the old one.
            {interval === 'year' &&
              ' UPI Autopay has no yearly frequency, so yearly plans are paid by eNACH or card.'}
            {price > 15000 &&
              ' Above ₹15,000 per debit, UPI Autopay and card mandates need extra customer authentication each cycle.'}
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <Button onClick={onCreate} disabled={create.isPending} className="w-full">
            {create.isPending ? 'Adding…' : '+ Add plan'}
          </Button>
        </div>
      </div>

      <div className="mt-10">
        <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono mb-3">
          Subscribers
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-2.5 grid grid-cols-[1.2fr_1fr_170px_130px_90px] gap-4 text-[11px] uppercase tracking-wider text-ink-soft font-mono border-b border-border">
            <div>Customer</div>
            <div>Plan</div>
            <div>Status</div>
            <div>Next charge</div>
            <div />
          </div>
          {subs.isLoading ? (
            <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
          ) : subs.data && subs.data.length > 0 ? (
            subs.data.map((s) => (
              <div
                key={s.id}
                className="px-5 py-3 grid grid-cols-[1.2fr_1fr_170px_130px_90px] gap-4 items-center border-t border-border first:border-t-0 hover:bg-surface-mute"
              >
                <div>
                  <a
                    href={`/customers/${s.customerId}`}
                    className="text-[13px] font-medium text-ink hover:underline"
                  >
                    {s.customerName}
                  </a>
                  <div className="text-[12px] text-ink-mute font-mono">
                    {s.customerPhone ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[13px] text-ink">{s.planName}</div>
                  <div className="text-[12px] text-ink-mute font-mono">
                    {formatMoney(s.amountCents, s.currency)}{' '}
                    {formatCadence(s.interval, s.intervalCount)}
                  </div>
                </div>
                <div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="text-[12px] text-ink-mute font-mono">
                  {s.nextChargeAt
                    ? new Date(s.nextChargeAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </div>
                <div className="text-right">
                  {!TERMINAL.has(s.status) && (
                    <button
                      type="button"
                      className="text-[12px] text-ink-mute hover:text-danger disabled:opacity-50"
                      disabled={cancel.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Cancel ${s.customerName}'s ${s.planName} membership? Their mandate is revoked at Cashfree and no further debits will be made.`,
                          )
                        ) {
                          cancel.mutate({ id: s.id });
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-[13px] text-ink-mute">No subscribers yet.</div>
          )}
        </div>
      </div>

      <div className="mt-8 bg-surface border border-border rounded-xl p-5 max-w-[860px]">
        <div className="text-[12px] uppercase tracking-wider font-mono text-ink-soft mb-2">
          Subscription webhook
        </div>
        <div className="text-[13px] font-mono text-ink break-all">POST {webhookUrl}</div>
        <div className="text-[12px] text-ink-mute mt-2">
          Add this in the Cashfree dashboard (Payment Gateway → Developers → Webhooks) for
          Subscription events. It keeps statuses, next-charge dates and payments in sync; it's
          verified with CASHFREE_CLIENT_SECRET.
        </div>
      </div>
    </div>
  );
}
