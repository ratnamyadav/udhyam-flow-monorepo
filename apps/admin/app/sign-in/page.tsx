'use client';

import { signIn } from '@udyamflow/auth/client';
import { Button, Input, Label, Logo } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminSignInPage() {
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
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[380px] bg-surface border border-border rounded-2xl p-9"
      >
        <div className="flex items-center justify-between mb-7">
          <Logo />
          <span className="text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            Admin
          </span>
        </div>
        <h1 className="text-[24px] font-medium tracking-tight text-ink mb-1.5">Internal sign-in</h1>
        <p className="text-[13px] text-ink-mute mb-7">
          For UdyamFlow staff only. Tenant sign-in is at the main app.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
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
    </div>
  );
}
