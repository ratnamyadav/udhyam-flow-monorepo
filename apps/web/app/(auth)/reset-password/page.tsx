'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

// useSearchParams forces dynamic rendering — wrap in Suspense so the build
// can statically pre-render the surrounding shell.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="w-full max-w-[420px] text-[13px] text-ink-mute">Loading…</div>}
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) {
      setError('Reset link is missing the token. Request a fresh email.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      const res = await authClient.resetPassword({ token, newPassword: password });
      if (res.error) {
        setStatus('error');
        setError(res.error.message ?? 'Could not reset password — the link may have expired.');
        return;
      }
      router.replace('/sign-in?reset=ok');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not reset password');
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-[420px] space-y-4">
        <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">Reset link invalid</h1>
        <p className="text-[14px] text-ink-mute leading-relaxed">
          That link is missing the reset token. Request a fresh one below.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-[13px] underline-offset-2 hover:underline text-ink"
        >
          Get a new reset link →
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div>
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Reset password
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">Set a new password</h1>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Confirm</Label>
          <Input
            id="pw2"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <Button onClick={submit} disabled={status === 'submitting'} className="w-full">
          {status === 'submitting' ? 'Saving…' : 'Set new password'}
        </Button>
      </div>
    </div>
  );
}
