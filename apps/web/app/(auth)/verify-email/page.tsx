'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { safeCallbackUrl } from '@/lib/safe-redirect';

// Holding screen for users who signed up but haven't clicked the verify link
// yet. If they have a session, poll it for a while — once `emailVerified`
// flips true, continue. Resending works without a session: we just need the
// email address.

const POLL_MS = 4000;
const MAX_POLLS = 75; // ~5 minutes

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<div className="w-full max-w-[420px] text-[13px] text-ink-mute">Loading…</div>}
    >
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'), '/onboarding/account');
  const session = authClient.useSession();
  const sessionEmail = session.data?.user?.email ?? null;

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const pollingStopped = polls >= MAX_POLLS;

  useEffect(() => {
    if (sessionEmail && !email) setEmail(sessionEmail);
  }, [sessionEmail, email]);

  useEffect(() => {
    if (session.data?.user?.emailVerified) router.replace(callbackUrl);
  }, [session.data?.user?.emailVerified, router, callbackUrl]);

  // Re-check periodically in case the user clicked the link in another tab.
  // Only meaningful with a session, and capped so an idle tab stops polling.
  const { refetch } = session;
  const hasSession = !!session.data?.user;
  useEffect(() => {
    if (!hasSession || pollingStopped) return;
    const t = setInterval(() => {
      refetch();
      setPolls((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [hasSession, pollingStopped, refetch]);

  async function resend() {
    const target = email.trim();
    if (!target.includes('@')) {
      setError('Enter the email you signed up with.');
      return;
    }
    setError(null);
    setStatus('sending');
    try {
      const res = await authClient.sendVerificationEmail({
        email: target,
        callbackURL: callbackUrl,
      });
      if (res.error) {
        setStatus('idle');
        setError(res.error.message ?? 'Could not resend the email');
        return;
      }
      setStatus('sent');
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Could not resend the email');
    }
  }

  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div>
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Verify email
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">Check your inbox</h1>
        <p className="text-[14px] text-ink-mute mt-2 leading-relaxed">
          We sent a confirmation link to{' '}
          <strong className="text-ink">{email || sessionEmail || 'your email'}</strong>. Open it to
          finish signing up
          {hasSession && !pollingStopped ? ' — this page will update on its own.' : '.'}
        </p>
        {hasSession && pollingStopped && (
          <p className="text-[13px] text-ink-mute mt-2">
            Already verified?{' '}
            <button
              type="button"
              className="text-ink underline underline-offset-2"
              onClick={() => {
                setPolls(0);
                refetch();
              }}
            >
              Check again
            </button>
          </p>
        )}
      </div>

      <div className="space-y-3">
        {!sessionEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setStatus('idle');
              }}
              placeholder="you@example.com"
            />
          </div>
        )}
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <Button onClick={resend} variant="outline" disabled={status !== 'idle'} className="w-full">
          {status === 'sending'
            ? 'Sending…'
            : status === 'sent'
              ? 'Re-sent ✓'
              : 'Resend verification email'}
        </Button>
      </div>

      <div className="text-[13px] text-ink-mute">
        <Link
          href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="hover:text-ink underline-offset-2 hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
