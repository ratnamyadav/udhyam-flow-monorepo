'use client';
import { authClient } from '@udyamflow/auth/client';
import { EmailOTPForm } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { SocialButtons } from '@/components/auth/social-buttons';
import { safeCallbackUrl } from '@/lib/safe-redirect';
export default function SignUpPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SignUpInner />
    </Suspense>
  );
}
function SignUpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = safeCallbackUrl(params.get('callbackUrl'), '/onboarding/account');
  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">Create your account</h1>
      <p className="text-sm text-ink-mute mb-8">
        Already registered?{' '}
        <Link className="underline" href={`/sign-in?callbackUrl=${encodeURIComponent(callback)}`}>
          Sign in
        </Link>
      </p>
      <SocialButtons callbackUrl={callback} />
      <EmailOTPForm
        signup
        client={authClient}
        onSuccess={async () => {
          await authClient.getSession();
          router.push(callback);
          router.refresh();
        }}
      />
      <p className="text-xs text-ink-mute mt-4">
        By creating an account you agree to our{' '}
        <Link className="underline" href="/legal/terms">
          Terms
        </Link>{' '}
        and{' '}
        <Link className="underline" href="/legal/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
