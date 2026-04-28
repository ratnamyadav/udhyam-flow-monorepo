'use client';

import { signIn } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? 'Could not sign in');
      return;
    }
    router.push('/dashboard');
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">Welcome back</h1>
      <p className="text-[14px] text-ink-mute mb-8">
        Don't have an account?{' '}
        <Link href="/sign-up" className="text-ink underline underline-offset-4">
          Start free
        </Link>
      </p>

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
