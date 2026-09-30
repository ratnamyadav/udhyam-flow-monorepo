'use client';

import { useState } from 'react';
import { useActiveRole } from '@/components/app-shell/use-role';
import { SkeletonRow } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Awaiting payment', color: 'var(--color-ink-mute)' },
  confirmed: { label: 'Confirmed', color: 'var(--accent)' },
  completed: { label: 'Completed', color: 'var(--color-success, #3d7c4d)' },
  cancelled: { label: 'Cancelled', color: 'var(--color-ink-mute)' },
  no_show: { label: 'No-show', color: 'var(--color-danger, #b00020)' },
  expired: { label: 'Expired', color: 'var(--color-ink-soft)' },
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Payment pending',
  paid: 'Paid',
  partially_refunded: 'Part refunded',
  refunded: 'Refunded',
  failed: 'Payment failed',
};

const STATUSES = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'expired',
] as const;
type Status = (typeof STATUSES)[number] | '';

const PAGE_SIZE = 50;

function money(cents: number, currency: string | null) {
  const value = cents / 100;
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

// <input type="date"> gives YYYY-MM-DD; filter on local-day boundaries.
function startOfDayIso(ymd: string) {
  return ymd ? new Date(`${ymd}T00:00:00`).toISOString() : undefined;
}
function endOfDayIso(ymd: string) {
  if (!ymd) return undefined;
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function BookingsPage() {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const resources = trpc.resource.list.useQuery();
  const [status, setStatus] = useState<Status>('');
  const [resourceId, setResourceId] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const filters = {
    status: status || undefined,
    resourceId: resourceId || undefined,
    from: startOfDayIso(from),
    to: endOfDayIso(to),
  };

  const pages = trpc.useQueries((t) =>
    Array.from({ length: pageCount }, (_, i) =>
      t.booking.list({ ...filters, limit: PAGE_SIZE, offset: i * PAGE_SIZE }),
    ),
  );

  function resetPaging<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPageCount(1);
    };
  }

  const onDone = (msg?: string) => {
    setActionError(null);
    setActionInfo(msg ?? null);
    return utils.booking.invalidate();
  };
  const onError = (err: { message: string }) => {
    setActionInfo(null);
    setActionError(err.message);
  };

  const cancel = trpc.booking.cancel.useMutation({
    onSuccess: (res) =>
      onDone(res.refunded ? 'Booking cancelled and refunded.' : 'Booking cancelled.'),
    onError,
  });
  const noShow = trpc.booking.markNoShow.useMutation({
    onSuccess: () => onDone('Marked as no-show.'),
    onError,
  });
  const complete = trpc.booking.markComplete.useMutation({
    onSuccess: () => onDone('Marked as completed.'),
    onError,
  });
  const refund = trpc.payment.refund.useMutation({
    onSuccess: (res) =>
      onDone(res.paymentStatus === 'refunded' ? 'Refund issued.' : 'Partial refund issued.'),
    onError,
  });
  const busy = cancel.isPending || noShow.isPending || complete.isPending || refund.isPending;

  function onRefund(b: {
    id: string;
    amountCents: number | null;
    refundedCents: number;
    currency: string | null;
  }) {
    const remaining = b.amountCents != null ? b.amountCents - b.refundedCents : null;
    const input = window.prompt(
      remaining != null
        ? `Refund amount (max ${money(remaining, b.currency)}). Leave blank for a full refund.`
        : 'Refund amount. Leave blank for a full refund.',
      '',
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) {
      refund.mutate({ bookingId: b.id });
      return;
    }
    const amount = Number(trimmed);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError('Enter a positive refund amount.');
      return;
    }
    const amountCents = Math.round(amount * 100);
    if (remaining != null && amountCents > remaining) {
      setActionError(`You can refund at most ${money(remaining, b.currency)}.`);
      return;
    }
    refund.mutate({ bookingId: b.id, amountCents });
  }

  const bookings = pages.flatMap((p) => p.data ?? []);
  const firstLoading = pages[0]?.isLoading ?? true;
  const loadingMore = pages.some((p, i) => i > 0 && p.isLoading);
  const listError = pages.find((p) => p.error)?.error ?? null;
  const lastPage = pages[pages.length - 1];
  const hasMore = !!lastPage?.data && lastPage.data.length === PAGE_SIZE;
  const resById = new Map((resources.data ?? []).map((r) => [r.id, r]));
  const selectClass =
    'text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink';

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Bookings
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">All bookings</h1>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-mute">
            From
            <input
              type="date"
              className={selectClass}
              value={from}
              max={to || undefined}
              onChange={(e) => resetPaging(setFrom)(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-mute">
            To
            <input
              type="date"
              className={selectClass}
              value={to}
              min={from || undefined}
              onChange={(e) => resetPaging(setTo)(e.target.value)}
            />
          </label>
          <select
            className={selectClass}
            value={status}
            onChange={(e) => resetPaging(setStatus)(e.target.value as Status)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]?.label ?? s}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={resourceId}
            onChange={(e) => resetPaging(setResourceId)(e.target.value)}
          >
            <option value="">All resources</option>
            {(resources.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {(from || to) && (
            <button
              type="button"
              className="text-[12px] text-ink-mute hover:text-ink"
              onClick={() => {
                setFrom('');
                setTo('');
                setPageCount(1);
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 text-[12px] text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2 flex justify-between gap-3">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {actionInfo && !actionError && (
        <div className="mb-4 text-[12px] text-success">{actionInfo}</div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[160px_1fr_180px_150px_220px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
          <div>When</div>
          <div>Customer</div>
          <div>Resource</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {firstLoading ? (
          <>
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
          </>
        ) : listError && bookings.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-danger">
            Couldn't load bookings: {listError.message}
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-ink-mute">
            No bookings match these filters.
          </div>
        ) : (
          bookings.map((b) => {
            const r = resById.get(b.resourceId);
            const isConfirmed = b.status === 'confirmed';
            const isPendingPayment = b.status === 'pending_payment';
            const isPaid = b.paymentStatus === 'paid' || b.paymentStatus === 'partially_refunded';
            const meta = STATUS_LABELS[b.status] ?? { label: b.status, color: 'var(--color-ink)' };
            const payLabel = PAYMENT_LABELS[b.paymentStatus];
            return (
              <div
                key={b.id}
                className="grid grid-cols-[160px_1fr_180px_150px_220px] px-5 py-3.5 border-t border-border first:border-t-0 items-center hover:bg-surface-mute"
              >
                <div className="text-[12px] font-mono tabular-nums text-ink">
                  {b.slotStart.toLocaleString([], {
                    timeZone: b.timezone,
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </div>
                <div>
                  <div className="text-[14px] font-medium text-ink">{b.customerName}</div>
                  <div className="text-[12px] text-ink-mute">
                    {b.customerEmail ?? b.customerPhone ?? '—'}
                  </div>
                </div>
                <div className="text-[13px] text-ink-mute">{r?.name ?? '—'}</div>
                <div className="flex flex-col items-start gap-1">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider"
                    style={{ background: 'var(--accent-soft)', color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  {payLabel && (
                    <span className="text-[10px] text-ink-mute font-mono">
                      {payLabel}
                      {b.amountCents ? ` · ${money(b.amountCents, b.currency)}` : ''}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px]">
                  {isConfirmed && (
                    <>
                      <button
                        type="button"
                        className="text-ink-mute hover:text-ink"
                        onClick={() => complete.mutate({ id: b.id })}
                        disabled={busy}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        className="text-ink-mute hover:text-danger"
                        onClick={() => noShow.mutate({ id: b.id })}
                        disabled={busy}
                      >
                        No-show
                      </button>
                    </>
                  )}
                  {(isConfirmed || isPendingPayment) && (
                    <button
                      type="button"
                      className="text-ink-mute hover:text-danger"
                      onClick={() => {
                        const msg = isPaid
                          ? 'Cancel this booking WITHOUT refunding the customer?'
                          : 'Cancel this booking?';
                        if (confirm(msg)) cancel.mutate({ id: b.id });
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  )}
                  {isAdmin && isConfirmed && isPaid && (
                    <button
                      type="button"
                      className="text-ink-mute hover:text-danger"
                      onClick={() => {
                        if (confirm('Cancel this booking and refund the customer in full?')) {
                          cancel.mutate({ id: b.id, refund: true });
                        }
                      }}
                      disabled={busy}
                    >
                      Cancel + refund
                    </button>
                  )}
                  {isAdmin && isPaid && (
                    <button
                      type="button"
                      className="text-ink-mute hover:text-danger"
                      onClick={() => onRefund(b)}
                      disabled={busy}
                    >
                      Refund
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {listError && bookings.length > 0 && (
        <div className="mt-3 text-[12px] text-danger">{listError.message}</div>
      )}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            className="px-4 py-2 rounded-md text-[13px] font-medium border border-border bg-surface text-ink disabled:opacity-50"
            onClick={() => setPageCount((n) => n + 1)}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
