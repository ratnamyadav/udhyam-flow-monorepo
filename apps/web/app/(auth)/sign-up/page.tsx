'use client';

import { signUp } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signUp.email({ name, email, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? 'Could not create account');
      return;
    }
    router.push('/onboarding/account');
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[400px]">
      <h1 className="text-[32px] font-medium tracking-tight text-ink mb-2">
        Start free for 6 months
      </h1>
      <p className="text-[14px] text-ink-mute mb-8">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>

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
