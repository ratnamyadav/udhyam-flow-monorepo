'use client';

import { emailOtp, signIn } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const RESEND_AFTER_SECONDS = 30;

// Passwordless sign-in: email → 6-digit code → signed in. Signing in with a
// new email creates the account, so sign-up uses the same form with a name
// field (`askName`).
export function EmailCodeForm({
  askName = false,
  callbackUrl,
  submitLabel,
}: {
  askName?: boolean;
  callbackUrl: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(to: string) {
    const res = await emailOtp.sendVerificationOtp({ email: to, type: 'sign-in' });
    if (res.error) throw new Error(res.error.message ?? 'Could not send the code');
    setSentTo(to);
    setCode('');
    setCooldown(RESEND_AFTER_SECONDS);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  function onRequest(e: React.FormEvent) {
    e.preventDefault();
    void run(() => sendCode(email.trim().toLowerCase()));
  }

  function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    void run(async () => {
      const res = await signIn.emailOtp({
        email: sentTo,
        otp: code.trim(),
        ...(askName && name.trim() ? { name: name.trim() } : {}),
      });
      if (res.error) {
        throw new Error(
          res.error.code === 'TOO_MANY_ATTEMPTS' || res.error.code === 'OTP_EXPIRED'
            ? 'That code can no longer be used. Send a new one.'
            : res.error.code === 'INVALID_OTP'
              ? 'That code is not right. Check the latest email and try again.'
              : (res.error.message ?? 'Could not sign in'),
        );
      }
      router.push(callbackUrl);
    });
  }

  if (sentTo) {
    return (
      <form onSubmit={onVerify} className="space-y-4">
        <p className="text-[14px] text-ink-mute">
          We emailed a 6-digit code to <span className="text-ink font-medium">{sentTo}</span>. It
          expires in 10 minutes.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
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
            className="font-mono tracking-[0.4em] text-[18px]"
          />
        </div>

        {error && <div className="text-[13px] text-danger">{error}</div>}

        <Button type="submit" disabled={pending || code.length !== 6} className="w-full">
          {pending ? 'Checking…' : submitLabel}
        </Button>
        <div className="flex justify-between text-[12px] text-ink-mute">
          <button
            type="button"
            className="hover:text-ink"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
          >
            Use a different email
          </button>
          <button
            type="button"
            className="hover:text-ink disabled:opacity-50 disabled:hover:text-ink-mute"
            disabled={pending || cooldown > 0}
            onClick={() => void run(() => sendCode(sentTo))}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onRequest} className="space-y-4">
      {askName && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
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

      {error && <div className="text-[13px] text-danger">{error}</div>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending code…' : 'Email me a code'}
      </Button>
    </form>
  );
}
