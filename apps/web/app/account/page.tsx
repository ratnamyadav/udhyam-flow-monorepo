'use client';
import { authClient, useSession } from '@udyamflow/auth/client';
import Link from 'next/link';
import { useState } from 'react';

export default function AccountPage() {
  const { data: session, isPending } = useSession();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function requestDeletion() {
    if (
      !window.confirm(
        'Send a verification email to delete your personal account? Transfer workspace ownership first. Business records stay with the workspace.',
      )
    )
      return;
    setBusy(true);
    try {
      const result = await authClient.deleteUser({ callbackURL: '/account-deletion' });
      setMessage(result.error?.message ?? 'Check your email and confirm deletion.');
    } catch {
      setMessage('Could not request deletion. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-xl mx-auto px-6 py-16 text-ink">
      <h1 className="text-3xl font-semibold">Your account</h1>
      {isPending ? (
        <p className="mt-4">Loading…</p>
      ) : !session ? (
        <Link href="/sign-in" className="block mt-4 underline">
          Sign in to manage your account
        </Link>
      ) : (
        <>
          <p className="mt-4">{session.user.email}</p>
          <h2 className="text-xl mt-8">Delete personal account</h2>
          <p className="mt-3">
            Deletion removes your login, sessions and workspace memberships. Workspace bookings,
            invoices and customer records stay with the business. If you own a workspace, transfer
            ownership and leave it in Settings → Team first.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={requestDeletion}
            className="mt-6 border border-border rounded-md px-5 py-3 text-danger"
          >
            {busy ? 'Sending…' : 'Send deletion verification email'}
          </button>
          <p role="status" className="mt-4">
            {message}
          </p>
        </>
      )}
      <Link href="/dashboard" className="block mt-8 underline">
        Back to dashboard
      </Link>
    </main>
  );
}
