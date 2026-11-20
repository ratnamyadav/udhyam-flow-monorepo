'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EmailCodeForm } from '@/components/auth/email-code-form';
import { SocialButtons } from '@/components/auth/social-buttons';
import { safeCallbackUrl } from '@/lib/safe-redirect';

export default function SignInPage() {
  return (
    <Suspense
      fallback={<div className="w-full max-w-[400px] text-[13px] text-ink-mute">Loading…</div>}
    >
      <SignInInner />
    </Suspense>
  );
}

function SignInInner() {
  const params = useSearchParams();
  // Only same-origin relative paths — never bounce users to another site.
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'));
  const signUpHref =
    callbackUrl === '/dashboard'
      ? '/sign-up'
      : `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">Welcome back</h1>
      <p className="text-[14px] text-ink-mute mb-8">
        Don't have an account?{' '}
        <Link href={signUpHref} className="text-ink underline underline-offset-4">
          Start free
        </Link>
      </p>

      <SocialButtons callbackUrl={callbackUrl} />

      <EmailCodeForm callbackUrl={callbackUrl} submitLabel="Sign in" />
    </div>
  );
}
