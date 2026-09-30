'use client';

import { signIn } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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
  const router = useRouter();
  const params = useSearchParams();
  // Only same-origin relative paths — never bounce users to another site.
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'));
  const signUpHref =
    callbackUrl === '/dashboard'
      ? '/sign-up'
      : `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const resetOk = params.get('reset') === 'ok';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? 'Could not sign in');
        return;
      }
      router.push(callbackUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">Welcome back</h1>
      <p className="text-[14px] text-ink-mute mb-8">
        Don't have an account?{' '}
        <Link href={signUpHref} className="text-ink underline underline-offset-4">
          Start free
        </Link>
      </p>

      {resetOk && (
        <div className="mb-5 bg-surface border border-border rounded-md px-3 py-2 text-[12px] text-ink">
          Your password was reset. Sign in with the new password.
        </div>
      )}

      <SocialButtons callbackUrl={callbackUrl} />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-[11px] text-ink-mute hover:text-ink">
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="text-[13px] text-danger">{error}</div>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  );
}
