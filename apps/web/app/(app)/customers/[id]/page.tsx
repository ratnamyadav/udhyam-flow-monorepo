'use client';

import { GST_STATES } from '@udyamflow/api/gst';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

export default function CustomerDetailPage() {
  const utils = trpc.useUtils();
  const { id } = useParams<{ id: string }>();
  const customer = trpc.customer.get.useQuery({ id });
  const bookings = trpc.customer.listBookings.useQuery({ id });
  const update = trpc.customer.update.useMutation({
    onSuccess: () => {
      utils.customer.get.invalidate({ id });
      utils.customer.list.invalidate();
    },
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');

  useEffect(() => {
    if (!customer.data) return;
    setName(customer.data.name);
    setEmail(customer.data.email ?? '');
    setPhone(customer.data.phone ?? '');
    setNotes(customer.data.notes ?? '');
    setGstin(customer.data.gstin ?? '');
    setStateCode(customer.data.stateCode ?? '');
  }, [customer.data]);

  function save() {
    update.mutate({
      id,
      name: name.trim() || undefined,
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      gstin: gstin.trim() || null,
      stateCode: stateCode || null,
    });
  }

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <Link href="/customers" className="text-[12px] text-ink-mute hover:text-ink font-mono">
          ← All customers
        </Link>
      </div>

      {customer.isLoading ? (
        <div className="text-[13px] text-ink-mute">Loading…</div>
      ) : !customer.data ? (
        <div className="text-[13px] text-danger">Customer not found.</div>
      ) : (
        <div className="grid grid-cols-[1fr_420px] gap-6">
          <div className="bg-surface border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Booking history</div>
              <div className="text-[11px] text-ink-soft font-mono">
                {bookings.data?.length ?? 0}
              </div>
            </div>
            {bookings.isLoading ? (
              <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
            ) : bookings.data && bookings.data.length > 0 ? (
              bookings.data.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[160px_1fr_120px] px-5 py-3.5 border-t border-border first:border-t-0 items-center"
                >
                  <div className="text-[12px] font-mono tabular-nums text-ink-mute">
                    {b.slotStart.toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </div>
                  <div className="text-[13px] text-ink">{b.id.slice(-6).toUpperCase()}</div>
                  <div className="text-[10px] uppercase tracking-wider font-mono text-ink-mute">
                    {b.status}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">No bookings yet.</div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit">
            <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
              Customer details
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cname">Name</Label>
              <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cemail">Email</Label>
              <Input id="cemail" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cphone">Phone</Label>
              <Input id="cphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cgstin">GSTIN (business)</Label>
                <Input id="cgstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cstate">State (for GST)</Label>
                <select
                  id="cstate"
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink"
                  value={stateCode}
                  disabled={!!gstin.trim()}
                  onChange={(e) => setStateCode(e.target.value)}
                >
                  <option value="">Same as business</option>
                  {Object.entries(GST_STATES).map(([code, n]) => (
                    <option key={code} value={code}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnotes">Notes</Label>
              <textarea
                id="cnotes"
                className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {update.error && <div className="text-[12px] text-danger">{update.error.message}</div>}
            <Button onClick={save} disabled={update.isPending} className="w-full">
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
