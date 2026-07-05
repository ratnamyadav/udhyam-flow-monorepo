'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Holding screen for users who signed up but haven't clicked the verify
// link yet. Polls the session — once `emailVerified` flips true, redirects
// to onboarding.

export default function VerifyEmailPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (session.data?.user?.emailVerified) {
      router.replace('/onboarding/account');
    }
  }, [session.data?.user?.emailVerified, router]);

  // Re-check every 4 seconds in case the user just clicked the link in
  // another tab.
  useEffect(() => {
    const t = setInterval(() => session.refetch(), 4000);
    return () => clearInterval(t);
  }, [session]);

  async function resend() {
    if (!session.data?.user?.email) return;
    try {
      await authClient.sendVerificationEmail({ email: session.data.user.email });
      setResent(true);
    } catch (e) {
      console.error(e);
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
          <strong className="text-ink">{session.data?.user?.email ?? 'your email'}</strong>. Open it
          to finish signing up — this page will update on its own.
        </p>
      </div>

      <Button onClick={resend} variant="outline" disabled={resent} className="w-full">
        {resent ? 'Re-sent ✓' : 'Resend verification email'}
      </Button>
    </div>
  );
}
