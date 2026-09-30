'use client';

import type { TenantTheme } from '@udyamflow/tokens';
import { useCallback, useEffect, useRef, useState } from 'react';

// Opens Cashfree's hosted mandate-approval checkout. Cashfree Subscriptions
// return a `subscription_session_id`, not a URL; the documented web flow is
// Cashfree.js v3 `subscriptionsCheckout({ subsSessionId, redirectTarget })`.
// Cashfree then redirects back to the subscription's return_url.

const CASHFREE_JS = 'https://sdk.cashfree.com/js/v3/cashfree.js';

type CashfreeInstance = {
  subscriptionsCheckout: (opts: {
    subsSessionId: string;
    redirectTarget?: '_self' | '_blank' | '_top';
  }) => Promise<{ error?: { message?: string } } | undefined>;
};

declare global {
  interface Window {
    Cashfree?: (opts: { mode: 'sandbox' | 'production' }) => CashfreeInstance;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadCashfreeJs(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CASHFREE_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Cashfree checkout'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function CashfreeMandateCheckout({
  sessionId,
  mode,
  theme,
}: {
  sessionId: string;
  mode: 'sandbox' | 'production';
  theme: TenantTheme;
}) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const started = useRef(false);

  const open = useCallback(async () => {
    setError(null);
    setOpening(true);
    try {
      await loadCashfreeJs();
      if (!window.Cashfree) throw new Error('Cashfree checkout unavailable');
      const result = await window.Cashfree({ mode }).subscriptionsCheckout({
        subsSessionId: sessionId,
        redirectTarget: '_self',
      });
      if (result?.error) throw new Error(result.error.message ?? 'Checkout failed to open');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed to open');
      setOpening(false);
    }
  }, [mode, sessionId]);

  // Auto-open once; the button stays as a manual fallback.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  }, [open]);

  return (
    <div className="max-w-[460px]">
      <h1
        className="text-[28px] m-0 font-medium tracking-tight text-ink"
        style={{ fontFamily: theme.fontDisplay, lineHeight: 1.15 }}
      >
        Approve your mandate
      </h1>
      <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
        Taking you to Cashfree to approve the recurring payment with UPI Autopay, net banking or
        your card. You'll come back here once it's done.
      </p>
      {error && <div className="mt-4 text-[13px] text-danger">{error}</div>}
      <button
        type="button"
        onClick={() => void open()}
        disabled={opening && !error}
        className="mt-6 px-5 py-2.5 text-white text-[13px] font-medium disabled:opacity-60"
        style={{ background: theme.accent, borderRadius: theme.radius }}
      >
        {opening && !error ? 'Opening Cashfree…' : 'Continue to approve'}
      </button>
    </div>
  );
}
