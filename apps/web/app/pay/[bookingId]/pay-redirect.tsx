'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/react';

// Starts checkout as soon as a real browser loads the page, then hands off
// to Stripe / Cashfree. The ref guard stops React strict mode's double
// effect from opening two gateway orders.
export function PayRedirect({ bookingId, orgSlug }: { bookingId: string; orgSlug: string }) {
  const checkout = trpc.payment.createCheckout.useMutation();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    checkout
      .mutateAsync({
        bookingId,
        returnUrl: `${window.location.origin}/book/${orgSlug}/confirmation`,
      })
      .then((res) => window.location.assign(res.redirectUrl))
      .catch(() =>
        setError(
          "We couldn't start the payment. Please try again, or pay at the venue if that's easier.",
        ),
      );
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, []);

  if (error) {
    return (
      <div className="mt-6">
        <div className="text-[13px] text-danger">{error}</div>
        <button
          type="button"
          onClick={start}
          disabled={checkout.isPending}
          className="mt-4 inline-block px-5 py-2.5 text-white text-[13px] font-medium rounded-md"
          style={{ background: 'var(--accent)' }}
        >
          {checkout.isPending ? 'Starting…' : 'Try again'}
        </button>
      </div>
    );
  }

  return <div className="mt-6 text-[13px] text-ink-mute">Redirecting you to secure payment…</div>;
}
