'use client';

import { useState } from 'react';
import { SkeletonRow } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'var(--accent)' },
  completed: { label: 'Completed', color: 'var(--color-success, #3d7c4d)' },
  cancelled: { label: 'Cancelled', color: 'var(--color-ink-mute)' },
  no_show: { label: 'No-show', color: 'var(--color-danger, #b00020)' },
};

type Status = 'confirmed' | 'cancelled' | 'completed' | 'no_show' | '';

export default function BookingsPage() {
  const utils = trpc.useUtils();
  const resources = trpc.resource.list.useQuery();
  const [status, setStatus] = useState<Status>('');
  const [resourceId, setResourceId] = useState<string>('');

  const list = trpc.booking.list.useQuery({
    status: status || undefined,
    resourceId: resourceId || undefined,
    limit: 200,
  });

  const cancel = trpc.booking.cancel.useMutation({
    onSuccess: () => utils.booking.invalidate(),
  });
  const noShow = trpc.booking.markNoShow.useMutation({
    onSuccess: () => utils.booking.invalidate(),
  });
  const complete = trpc.booking.markComplete.useMutation({
    onSuccess: () => utils.booking.invalidate(),
  });
  const refund = trpc.payment.refund.useMutation({
    onSuccess: () => utils.booking.invalidate(),
  });
  const invoicing = trpc.invoicing.status.useQuery();
  const invoices = trpc.invoicing.list.useQuery();
  const createInvoice = trpc.invoicing.create.useMutation({
    onSuccess: () => utils.invoicing.list.invalidate(),
    onError: (err) => alert(err.message),
  });

  const bookings = list.data ?? [];
  const resById = new Map((resources.data ?? []).map((r) => [r.id, r]));
  const invoiceByBooking = new Map((invoices.data ?? []).map((i) => [i.bookingId, i]));
  const canInvoice = (invoicing.data?.provider ?? 'none') !== 'none';

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Bookings
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">All bookings</h1>
        </div>
        <div className="flex gap-2 items-center">
          <select
            className="text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
          </select>
          <select
            className="text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
          >
            <option value="">All resources</option>
            {(resources.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[160px_1fr_180px_120px_260px] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
          <div>When</div>
          <div>Customer</div>
          <div>Resource</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {list.isLoading ? (
          <>
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
            <SkeletonRow cols={5} />
          </>
        ) : bookings.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-ink-mute">
            No bookings in this window. Try a different filter.
          </div>
        ) : (
          bookings.map((b) => {
            const r = resById.get(b.resourceId);
            const isFuture = b.slotStart > new Date();
            const isConfirmed = b.status === 'confirmed';
            const meta = STATUS_LABELS[b.status] ?? STATUS_LABELS.confirmed!;
            const inv = invoiceByBooking.get(b.id);
            return (
              <div
                key={b.id}
                className="grid grid-cols-[160px_1fr_180px_120px_260px] px-5 py-3.5 border-t border-border first:border-t-0 items-center hover:bg-surface-mute"
              >
                <div className="text-[12px] font-mono tabular-nums text-ink">
                  {b.slotStart.toLocaleString([], {
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
                  {(b.meetingUrl || b.source) && (
                    <div className="flex gap-2 mt-0.5 text-[11px]">
                      {b.meetingUrl && (
                        <a
                          href={b.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-mute hover:text-ink underline"
                        >
                          Join online
                        </a>
                      )}
                      {b.source && <span className="font-mono text-ink-soft">via {b.source}</span>}
                    </div>
                  )}
                </div>
                <div className="text-[13px] text-ink-mute">{r?.name ?? '—'}</div>
                <div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider"
                    style={{ background: 'var(--accent-soft)', color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  {b.customerConfirmedAt && isConfirmed && (
                    <div
                      className="text-[10px] text-ink-mute mt-1"
                      title={`Customer confirmed via WhatsApp on ${b.customerConfirmedAt.toLocaleString()}`}
                    >
                      ✓ Confirmed by customer
                    </div>
                  )}
                </div>
                <div className="flex gap-2 text-[12px]">
                  {inv ? (
                    inv.hostedUrl ? (
                      <a
                        href={inv.hostedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink hover:underline underline-offset-2"
                        title={`${inv.provider} invoice · ${inv.status}`}
                      >
                        {inv.number ? `Invoice ${inv.number}` : 'Invoice'} ↗
                      </a>
                    ) : (
                      <span className="text-ink-mute" title={inv.provider}>
                        {inv.status === 'pending' ? 'Invoicing…' : `Invoice ${inv.number ?? ''}`}
                      </span>
                    )
                  ) : (
                    canInvoice &&
                    b.serviceId &&
                    b.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="text-ink-mute hover:text-ink"
                        onClick={() => createInvoice.mutate({ bookingId: b.id })}
                        disabled={createInvoice.isPending}
                      >
                        {createInvoice.isPending && createInvoice.variables?.bookingId === b.id
                          ? 'Invoicing…'
                          : 'Invoice'}
                      </button>
                    )
                  )}
                  {b.paymentStatus === 'paid' && (
                    <button
                      type="button"
                      className="text-ink-mute hover:text-danger"
                      onClick={() => {
                        if (confirm(`Refund this booking?`)) refund.mutate({ bookingId: b.id });
                      }}
                      disabled={refund.isPending}
                    >
                      Refund
                    </button>
                  )}
                  {isConfirmed && isFuture && (
                    <button
                      type="button"
                      className="text-ink-mute hover:text-danger"
                      onClick={() => cancel.mutate({ id: b.id })}
                      disabled={cancel.isPending}
                    >
                      Cancel
                    </button>
                  )}
                  {isConfirmed && !isFuture && (
                    <>
                      <button
                        type="button"
                        className="text-ink-mute hover:text-ink"
                        onClick={() => complete.mutate({ id: b.id })}
                        disabled={complete.isPending}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        className="text-ink-mute hover:text-danger"
                        onClick={() => noShow.mutate({ id: b.id })}
                        disabled={noShow.isPending}
                      >
                        No-show
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
