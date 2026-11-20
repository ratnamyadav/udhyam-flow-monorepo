'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EmailCodeForm } from '@/components/auth/email-code-form';
import { SocialButtons } from '@/components/auth/social-buttons';
import { safeCallbackUrl } from '@/lib/safe-redirect';

const DEFAULT_CALLBACK = '/onboarding/account';

// useSearchParams forces dynamic rendering — wrap in Suspense.
export default function SignUpPage() {
  return (
    <Suspense
      fallback={<div className="w-full max-w-[400px] text-[13px] text-ink-mute">Loading…</div>}
    >
      <SignUpInner />
    </Suspense>
  );
}

function SignUpInner() {
  const params = useSearchParams();
  // Preserved so invitees land back on /accept-invitation/… after signing up.
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'), DEFAULT_CALLBACK);
  const signInHref =
    callbackUrl === DEFAULT_CALLBACK
      ? '/sign-in'
      : `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">
        Start free for 6 months
      </h1>
      <p className="text-[14px] text-ink-mute mb-8">
        Already have an account?{' '}
        <Link href={signInHref} className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>

      <SocialButtons callbackUrl={callbackUrl} />

      <EmailCodeForm askName callbackUrl={callbackUrl} submitLabel="Create account →" />
      <p className="mt-4 text-[11px] text-ink-soft text-center">
        By creating an account you agree to our{' '}
        <Link href="/legal/terms" className="underline underline-offset-2 hover:text-ink">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
