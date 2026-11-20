'use client';
import { signOut, useSession } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';

export default function AccountPage() {
  const { data: session } = useSession();
  const [confirm, setConfirm] = useState('');
  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut().catch(() => {});
      window.location.assign('/');
    },
  });
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-3xl font-medium">Your account</h1>
      <p className="mt-3 text-sm text-ink-mute">Signed in as {session?.user.email}</p>

      <section className="mt-10 border border-danger/40 rounded-xl p-5">
        <h2 className="text-lg font-medium">Delete account</h2>
        <div className="mt-2 text-sm text-ink-mute space-y-2">
          <p>This permanently deletes your login and removes you from every workspace.</p>
          <p>
            If you run a workspace on your own, it is closed: billing and customers’ recurring
            memberships are cancelled, and its booking page stops taking bookings. If others work in
            the workspace with you, make one of them an owner first.
          </p>
          <p>
            Booking, invoice and payment records are kept as tax law requires. See our{' '}
            <Link href="/legal/privacy" className="underline underline-offset-2">
              privacy policy
            </Link>
            .
          </p>
        </div>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm === 'DELETE') deleteAccount.mutate({ confirm: 'DELETE' });
          }}
        >
          <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
          <Input
            id="confirm-delete"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {deleteAccount.error && (
            <p role="alert" className="text-sm text-danger">
              {deleteAccount.error.message}
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            className="border-danger text-danger hover:bg-danger/10"
            disabled={confirm !== 'DELETE' || deleteAccount.isPending}
          >
            {deleteAccount.isPending ? 'Deleting…' : 'Delete my account'}
          </Button>
        </form>
      </section>
    </div>
  );
}
