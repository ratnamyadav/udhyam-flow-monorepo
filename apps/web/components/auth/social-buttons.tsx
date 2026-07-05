'use client';

import { authClient } from '@udyamflow/auth/client';
import { trpc } from '@/lib/trpc/react';

// Renders enabled social-login buttons. Hidden entirely when nothing is
// configured server-side so we don't ship dead UI to OSS users.

export function SocialButtons({ callbackUrl }: { callbackUrl: string }) {
  const providers = trpc.auth.providers.useQuery(undefined, { staleTime: 60_000 });

  if (!providers.data) return null;
  const any = providers.data.google;
  if (!any) return null;

  return (
    <div className="space-y-3 mb-5">
      {providers.data.google && (
        <button
          type="button"
          onClick={() => {
            void authClient.signIn.social({ provider: 'google', callbackURL: callbackUrl });
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border border-border bg-surface text-[13px] font-medium text-ink hover:bg-surface-mute transition-colors"
        >
          <GoogleMark />
          Continue with Google
        </button>
      )}
      <div className="flex items-center gap-3 text-[11px] text-ink-soft uppercase tracking-wider font-mono">
        <div className="flex-1 h-px bg-border" />
        or with email
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <title>Google</title>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.75 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.99.67-2.25 1.07-3.72 1.07-2.86 0-5.28-1.93-6.14-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.86 14.12a6.62 6.62 0 0 1 0-4.24V7.04H2.18a11 11 0 0 0 0 9.92l3.68-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.46 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.04l3.68 2.84C6.72 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
