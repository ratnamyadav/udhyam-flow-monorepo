'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setStatus('sending');
    setError(null);
    try {
      const res = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: '/reset-password',
      });
      if (res.error) {
        setStatus('error');
        setError(res.error.message ?? 'Could not send reset email');
        return;
      }
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not send reset email');
    }
  }

  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div>
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Forgot password
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">Reset your password</h1>
        <p className="text-[14px] text-ink-mute mt-2 leading-relaxed">
          Enter your email and we'll send you a link to set a new one.
        </p>
      </div>

      {status === 'sent' ? (
        <div className="bg-surface border border-border rounded-xl p-5 text-[13px] text-ink">
          Check your inbox for the reset link. It expires in one hour.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <Button
            onClick={submit}
            disabled={status === 'sending' || !email.includes('@')}
            className="w-full"
          >
            {status === 'sending' ? 'Sending…' : 'Send reset link'}
          </Button>
        </div>
      )}

      <div className="text-[13px] text-ink-mute">
        <Link href="/sign-in" className="hover:text-ink underline-offset-2 hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
