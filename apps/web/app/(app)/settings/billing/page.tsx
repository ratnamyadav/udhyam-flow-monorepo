'use client';
import { useEffect, useState } from 'react';
import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

export default function BillingPage() {
  const utils = trpc.useUtils();
  const { isAdmin } = useActiveRole();
  const status = trpc.billing.status.useQuery(undefined, { refetchInterval: 10_000 });
  const subscribe = trpc.billing.subscribe.useMutation({
    onSuccess: (result) => window.location.assign(result.url),
  });
  const cancel = trpc.billing.cancel.useMutation({
    onSuccess: () => utils.billing.status.invalidate(),
  });
  const refresh = trpc.billing.refresh.useMutation({
    onSuccess: () => utils.billing.status.invalidate(),
  });
  const [phone, setPhone] = useState('');
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    setReturned(new URLSearchParams(window.location.search).has('returned'));
  }, []);
  const trial = status.data?.trialUntil;
  const free = trial && new Date(trial) > new Date();
  const errors = [status.error, subscribe.error, cancel.error, refresh.error].filter(Boolean);
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-3xl font-medium">Workspace billing</h1>
      <p className="mt-3 text-sm text-ink-mute">
        {free
          ? `Your workspace is free until ${new Date(trial).toLocaleDateString()}.`
          : 'Your free trial has ended. Each location needs paid billing to accept new bookings.'}{' '}
        After the trial, each location costs ₹299 per month in India or $10 per month globally.
        Existing bookings and workspace data remain accessible.
      </p>
      <p className="mt-2 text-sm text-ink-mute">
        Each location has a separate subscription. Cancelling stops renewal; paid access continues
        until the end of the period. Cancel billing before archiving a location.
      </p>
      {returned && (
        <p className="mt-4 text-sm">
          Authorization received. Refresh billing below if the provider is still processing it.
          Access is confirmed by payment notifications.
        </p>
      )}
      {!isAdmin && <MemberNote what="manage workspace billing" />}
      {errors.map((error) => (
        <p role="alert" key={error!.message} className="mt-3 text-danger text-sm">
          {error!.message}
        </p>
      ))}
      <label className="block mt-6 text-sm">
        Indian mobile for UPI or bank mandate authorization
        <input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="block mt-2 w-full max-w-sm border border-border rounded-md p-3 bg-surface"
        />
      </label>
      <div className="mt-6 grid gap-4">
        {status.data?.locations.map((location) => {
          const sub = location.subscription;
          const active = sub && !['cancelled', 'expired'].includes(sub.status);
          const paid = sub?.paidUntil && new Date(sub.paidUntil) > new Date();
          const access = location.access;
          // A live subscription keeps the price and provider it started with;
          // a location currency change applies to the next subscription.
          const currency = active ? sub.currency : location.currency === 'INR' ? 'INR' : 'USD';
          const nextCurrency = location.currency === 'INR' ? 'INR' : 'USD';
          const configured =
            currency === 'INR' ? status.data!.cashfreeConfigured : status.data!.stripeConfigured;
          const day = (d: Date | string) => new Date(d).toLocaleDateString();
          return (
            <section
              key={location.id}
              className="rounded-xl border border-border p-5 bg-surface min-w-0"
            >
              <h2 className="text-lg font-medium break-words">{location.name}</h2>
              <p className="mt-1 text-sm text-ink-mute">
                {currency === 'INR' ? '₹299' : '$10'} per month ·{' '}
                {access.state === 'trial'
                  ? 'Free trial'
                  : access.state === 'paid'
                    ? active
                      ? 'Paid access'
                      : `Paid access ends ${day(access.paidUntil)}`
                    : access.state === 'grace'
                      ? 'Payment overdue'
                      : 'Billing required — new bookings are paused'}
              </p>
              {access.state === 'grace' && access.accessUntil && (
                <p role="status" className="mt-2 text-sm text-danger">
                  Payment overdue — bookings pause on {day(access.accessUntil)}. Check the payment
                  method with {sub?.provider === 'cashfree' ? 'your bank or UPI app' : 'Stripe'},
                  then refresh billing.
                </p>
              )}
              {active && currency !== nextCurrency && (
                <p className="mt-2 text-sm text-ink-mute">
                  This subscription stays in {currency}. The location's {nextCurrency} currency
                  applies once you cancel and start a new subscription after the paid period.
                </p>
              )}
              {sub && (
                <p className="mt-2 text-sm">
                  Subscription: {sub.status.replace('_', ' ')}
                  {sub.paidUntil ? ` · paid until ${day(sub.paidUntil)}` : ''}
                </p>
              )}
              {!configured && (
                <p className="mt-2 text-sm text-ink-mute">
                  Contact support to enable {currency === 'INR' ? 'Cashfree' : 'Stripe'} billing.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                {(!active || sub?.status === 'pending' || sub?.status === 'initializing') &&
                  !paid && (
                    <button
                      type="button"
                      disabled={!isAdmin || !configured || subscribe.isPending}
                      onClick={() =>
                        subscribe.mutate({
                          locationId: location.id,
                          phone: currency === 'INR' ? phone : undefined,
                        })
                      }
                      className="rounded-md px-4 py-2 bg-ink text-bg disabled:opacity-50"
                    >
                      {sub?.checkoutUrl
                        ? 'Resume authorization'
                        : free
                          ? 'Set up billing after trial'
                          : 'Subscribe'}
                    </button>
                  )}
                {active && (
                  <>
                    <button
                      type="button"
                      disabled={!isAdmin || refresh.isPending}
                      onClick={() => refresh.mutate({ id: sub.id })}
                      className="rounded-md border border-border px-4 py-2 disabled:opacity-50"
                    >
                      Refresh billing
                    </button>
                    <button
                      type="button"
                      disabled={!isAdmin || cancel.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Stop billing renewal for ${location.name}? Paid access continues until its period ends.`,
                          )
                        )
                          cancel.mutate({ id: sub.id });
                      }}
                      className="rounded-md border border-border px-4 py-2 text-danger disabled:opacity-50"
                    >
                      Cancel renewal
                    </button>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
