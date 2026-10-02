'use client';
import { useEffect, useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

type Result = { error?: unknown };
export type EmailOTPClient = {
  emailOtp: { sendVerificationOtp(input: { email: string; type: 'sign-in' }): Promise<Result> };
  signIn: { emailOtp(input: { email: string; otp: string; name?: string }): Promise<Result> };
};

export function EmailOTPForm({
  client,
  signup = false,
  onSuccess,
}: {
  client: EmailOTPClient;
  signup?: boolean;
  onSuccess: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  async function send() {
    if (busy || remaining) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await client.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: 'sign-in',
      });
      if (result.error) {
        setMessage('Unable to send a code. Wait a moment and try again.');
        return;
      }
      setEmail(email.trim().toLowerCase());
      setCode('');
      setSent(true);
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
      setMessage(
        'Check your inbox for a code. It expires in 5 minutes. Only the newest code works.',
      );
    } catch {
      setMessage('Unable to send a code. Wait a moment and try again.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sent) {
      await send();
      return;
    }
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await client.signIn.emailOtp({
        email,
        otp: code,
        ...(signup ? { name: name.trim() } : {}),
      });
      if (result.error) {
        setMessage('Unable to verify this code. Check it or request a new one.');
        return;
      }
      setCode('');
      await onSuccess();
    } catch {
      setMessage('Unable to verify this code. Check it or request a new one.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {signup && !sent && (
        <div className="space-y-1.5">
          <Label htmlFor="otp-name">Your name</Label>
          <Input
            id="otp-name"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      {!sent ? (
        <div className="space-y-1.5">
          <Label htmlFor="otp-email">Email</Label>
          <Input
            id="otp-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-mute">Enter the code sent to {email}.</p>
          <div className="space-y-1.5">
            <Label htmlFor="otp-code">6-digit email code</Label>
            <Input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              disabled={busy}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-describedby="otp-status"
            />
          </div>
        </>
      )}
      <p id="otp-status" role="status" aria-live="polite" className="text-sm text-ink-mute">
        {message}
      </p>
      <Button type="submit" disabled={busy || (sent && code.length !== 6)} className="w-full">
        {busy ? 'Please wait…' : sent ? 'Verify and continue' : 'Email me a code'}
      </Button>
      {sent && (
        <div className="flex justify-between gap-3">
          <Button type="button" variant="outline" disabled={busy || remaining > 0} onClick={send}>
            {remaining ? `Resend in ${remaining}s` : 'Resend code'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setResendAt(0);
              setCode('');
              setMessage('');
            }}
          >
            Change email / Back
          </Button>
        </div>
      )}
      <p className="text-xs text-ink-mute">
        No password needed. Use the same email to keep your existing account.
      </p>
    </form>
  );
}
