'use client';
import { authClient } from '@udyamflow/auth/client';
import { EmailOTPForm } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { SocialButtons } from '@/components/auth/social-buttons';
import { safeCallbackUrl } from '@/lib/safe-redirect';
export default function SignInPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SignInInner />
    </Suspense>
  );
}
function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = safeCallbackUrl(params.get('callbackUrl'));
  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">Welcome back</h1>
      <p className="text-sm text-ink-mute mb-8">
        Sign in with a code sent to your email.{' '}
        <Link className="underline" href={`/sign-up?callbackUrl=${encodeURIComponent(callback)}`}>
          Create an account
        </Link>
      </p>
      <SocialButtons callbackUrl={callback} />
      <EmailOTPForm
        client={authClient}
        onSuccess={async () => {
          await authClient.getSession();
          router.push(callback);
          router.refresh();
        }}
      />
    </div>
  );
}
