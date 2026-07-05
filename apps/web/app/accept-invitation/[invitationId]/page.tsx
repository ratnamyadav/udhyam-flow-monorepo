'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button } from '@udyamflow/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Accept-invitation flow. The invitation id is the path param; on submit we
// call authClient.organization.acceptInvitation. If the user isn't signed in
// yet, we send them to /sign-in?callbackUrl=… and bounce back here.

export default function AcceptInvitationPage() {
  const router = useRouter();
  const { invitationId } = useParams<{ invitationId: string }>();
  const session = authClient.useSession();
  const [status, setStatus] = useState<'idle' | 'pending' | 'error' | 'ok'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.isPending) return;
    if (!session.data?.user) {
      const target = `/accept-invitation/${invitationId}`;
      router.replace(`/sign-in?callbackUrl=${encodeURIComponent(target)}`);
    }
  }, [session, invitationId, router]);

  async function onAccept() {
    setStatus('pending');
    setError(null);
    try {
      await authClient.organization.acceptInvitation({ invitationId });
      setStatus('ok');
      router.replace('/dashboard');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not accept invitation');
    }
  }

  if (session.isPending || !session.data?.user) {
    return (
      <div className="min-h-screen bg-bg grid place-items-center text-ink-mute text-[13px]">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg grid place-items-center p-8">
      <div className="max-w-[460px] w-full bg-surface border border-border rounded-2xl p-8">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
          Invitation
        </div>
        <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">Join the workspace</h1>
        <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
          You're signed in as <strong className="text-ink">{session.data.user.email}</strong>.
          Accept to switch into this workspace.
        </p>
        {error && (
          <div className="mt-4 text-[12px] text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={onAccept} disabled={status === 'pending'}>
            {status === 'pending' ? 'Joining…' : 'Accept & continue'}
          </Button>
          <Link
            href="/dashboard"
            className="text-[13px] text-ink-mute hover:text-ink underline-offset-2 hover:underline"
          >
            Maybe later
          </Link>
        </div>
      </div>
    </div>
  );
}
