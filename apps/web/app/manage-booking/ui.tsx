'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';
export function BookingManagement() {
  const params = useSearchParams();
  const bookingId = params.get('booking') ?? '';
  const token = params.get('token') ?? '';
  const [date, setDate] = useState('');
  const [message, setMessage] = useState('');
  const status = trpc.booking.publicStatus.useQuery(
    { bookingId },
    { enabled: !!bookingId && !!token },
  );
  const slots = trpc.booking.managementSlots.useQuery(
    { bookingId, token, date },
    { enabled: !!date && !!bookingId && !!token, retry: false },
  );
  const cancel = trpc.booking.cancelPublic.useMutation({
    onSuccess: () => {
      setMessage('Booking cancelled. Contact the business about any refund.');
      void status.refetch();
    },
  });
  const reschedule = trpc.booking.reschedulePublic.useMutation({
    onSuccess: () => {
      setMessage('Time changed. A new confirmation is on its way.');
      void status.refetch();
      void slots.refetch();
    },
  });
  const busy = cancel.isPending || reschedule.isPending;
  const error = status.error ?? slots.error ?? cancel.error ?? reschedule.error;
  const editable =
    status.data &&
    ['confirmed', 'pending_payment'].includes(status.data.status) &&
    new Date(status.data.slotStart).getTime() > Date.now();
  return (
    <main className="max-w-xl mx-auto px-6 py-16 text-ink">
      <h1 className="text-3xl font-semibold">Manage your booking</h1>
      {!bookingId || !token ? (
        <p className="mt-4">Open the management link from your confirmation email.</p>
      ) : (
        <>
          {status.data && (
            <p className="mt-4">
              {status.data.orgName} · {status.data.resourceName}
              <br />
              {new Intl.DateTimeFormat('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: status.data.timezone,
              }).format(new Date(status.data.slotStart))}{' '}
              ({status.data.timezone}) · {status.data.status.replace('_', ' ')}
            </p>
          )}
          <p className="mt-4">
            Change the time with the same provider and service, or cancel before your appointment
            starts. Refunds are handled by the business.
          </p>
          {editable && (
            <>
              {status.data?.status === 'confirmed' && (
                <>
                  <label className="block mt-6" htmlFor="date">
                    Choose a new date (business timezone)
                  </label>
                  <input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="border border-border bg-surface p-3 rounded mt-2"
                  />
                  {slots.isFetching && <p className="mt-3">Checking availability…</p>}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {slots.data?.slots.map((slot) => (
                      <button
                        type="button"
                        key={slot.start}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(`Move your booking to ${date} at ${slot.displayTime}?`)
                          )
                            reschedule.mutate({ bookingId, token, slotStart: slot.start });
                        }}
                        className="border border-border rounded px-4 py-2"
                      >
                        {slot.displayTime}
                      </button>
                    ))}
                  </div>
                  {slots.data?.slots.length === 0 && (
                    <p className="mt-3">No available slots. Choose another date.</p>
                  )}
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Cancel this appointment? Refunds must be arranged with the business.',
                    )
                  )
                    cancel.mutate({ bookingId, token });
                }}
                className="mt-8 border border-border rounded px-5 py-3 text-danger"
              >
                Cancel booking
              </button>
            </>
          )}
          {!editable && status.data && (
            <p className="mt-4">
              This appointment cannot be changed online. Contact the business for help.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-danger">
              {error.message}
            </p>
          )}
          <p role="status" className="mt-4">
            {message}
          </p>
        </>
      )}
    </main>
  );
}
