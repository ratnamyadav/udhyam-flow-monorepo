'use client';

import { emailOtp, signIn } from '@udyamflow/auth/client';
import { Button, Input, Label, Logo } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Same passwordless sign-in as the main app: email → 6-digit code.
export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (!sentTo) {
        const to = email.trim().toLowerCase();
        const res = await emailOtp.sendVerificationOtp({ email: to, type: 'sign-in' });
        if (res.error) throw new Error(res.error.message ?? 'Could not send the code');
        setSentTo(to);
        return;
      }
      const res = await signIn.emailOtp({ email: sentTo, otp: code.trim() });
      if (res.error) throw new Error(res.error.message ?? 'Could not sign in');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setPending(false);
    }
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
          {sentTo ? (
            <div className="space-y-1.5">
              <Label htmlFor="code">Code sent to {sentTo}</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono tracking-[0.4em]"
              />
            </div>
          ) : (
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
          )}
          {error && <div className="text-[13px] text-danger">{error}</div>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Please wait…' : sentTo ? 'Sign in' : 'Email me a code'}
          </Button>
          {sentTo && (
            <button
              type="button"
              className="w-full text-[12px] text-ink-mute hover:text-ink"
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
