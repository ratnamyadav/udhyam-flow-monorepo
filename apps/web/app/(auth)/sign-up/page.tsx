'use client';

import { signUp } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { SocialButtons } from '@/components/auth/social-buttons';
import { safeCallbackUrl } from '@/lib/safe-redirect';
import { trpc } from '@/lib/trpc/react';

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
  const router = useRouter();
  const params = useSearchParams();
  // Preserved so invitees land back on /accept-invitation/… after signing up.
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'), DEFAULT_CALLBACK);
  const signInHref =
    callbackUrl === DEFAULT_CALLBACK
      ? '/sign-in'
      : `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const providers = trpc.auth.providers.useQuery(undefined, { staleTime: 60_000 });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await signUp.email({ name, email, password, callbackURL: callbackUrl });
      if (res.error) {
        setError(res.error.message ?? 'Could not create account');
        return;
      }
      // When the server requires email verification there's no session yet —
      // hold on /verify-email (which carries the callback through). Otherwise
      // go straight on.
      const verified = !!(res.data && 'user' in res.data && res.data.user?.emailVerified);
      // If the providers lookup hasn't landed, infer from the response: no
      // session token means the server is waiting on verification.
      const hasSession = !!(res.data && 'token' in res.data && res.data.token);
      const needsVerification = providers.data
        ? providers.data.emailVerificationRequired && !verified
        : !hasSession;
      if (needsVerification) {
        const qs = new URLSearchParams({ email: email.trim(), callbackUrl });
        router.push(`/verify-email?${qs.toString()}`);
      } else {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[400px]">
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

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="text-[13px] text-danger">{error}</div>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creating account…' : 'Create account →'}
        </Button>
        <p className="text-[11px] text-ink-soft text-center">
          By creating an account you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </form>
  );
}
