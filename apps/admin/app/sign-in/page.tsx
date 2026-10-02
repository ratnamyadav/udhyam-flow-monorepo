'use client';
import { authClient } from '@udyamflow/auth/client';
import { EmailOTPForm, Logo } from '@udyamflow/ui';
import { useRouter } from 'next/navigation';
export default function AdminSignInPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <div className="w-full max-w-[380px] bg-surface border border-border rounded-2xl p-9">
        <Logo />
        <h1 className="text-2xl font-medium text-ink mt-6">Internal sign-in</h1>
        <p className="text-sm text-ink-mute my-5">
          Use your existing staff email. Email verification does not grant administrative access.
        </p>
        <EmailOTPForm
          client={authClient}
          onSuccess={async () => {
            await authClient.getSession();
            router.push('/dashboard');
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
