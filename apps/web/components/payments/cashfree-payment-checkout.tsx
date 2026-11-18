'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCashfreeJs } from '../memberships/cashfree-mandate-checkout';

export function CashfreePaymentCheckout({
  sessionId,
  mode,
}: {
  sessionId: string;
  mode: 'sandbox' | 'production';
}) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const started = useRef(false);
  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      await loadCashfreeJs();
      if (!window.Cashfree) throw new Error('Payment checkout is unavailable.');
      const result = await window
        .Cashfree({ mode })
        .checkout({ paymentSessionId: sessionId, redirectTarget: '_self' });
      if (result?.error) throw new Error(result.error.message ?? 'Could not open payment.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open payment.');
      setOpening(false);
    }
  }, [sessionId, mode]);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void open();
    }
  }, [open]);
  return (
    <div>
      <h1 className="text-2xl font-medium">Complete your payment</h1>
      <p className="mt-3 text-sm text-ink-mute">Opening secure checkout with Cashfree.</p>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={opening}
        onClick={() => void open()}
        className="mt-6 rounded-md bg-ink text-bg px-5 py-3 disabled:opacity-50"
      >
        {opening ? 'Opening checkout…' : 'Continue to payment'}
      </button>
    </div>
  );
}
