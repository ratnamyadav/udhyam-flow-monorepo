'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import { useState, useTransition } from 'react';
import { trpc } from '@/lib/trpc/react';

export default function TeamSettingsPage() {
  const utils = trpc.useUtils();
  const members = trpc.team.listMembers.useQuery();
  const pending = trpc.team.listPendingInvitations.useQuery();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function invite() {
    setError(null);
    setInfo(null);
    if (!email.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    startTransition(async () => {
      try {
        await authClient.organization.inviteMember({ email: email.trim(), role });
        setEmail('');
        setInfo('Invitation sent.');
        utils.team.listPendingInvitations.invalidate();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send invitation');
      }
    });
  }

  function cancelInvite(invitationId: string) {
    startTransition(async () => {
      try {
        await authClient.organization.cancelInvitation({ invitationId });
        utils.team.listPendingInvitations.invalidate();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not cancel invitation');
      }
    });
  }

  return (
    <div className="px-12 py-10 max-w-[1280px] mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-2 font-mono">
            Settings · Team
          </div>
          <h1 className="text-[32px] font-medium tracking-tight text-ink">Team & invites</h1>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-6">
        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Members</div>
              <div className="text-[11px] text-ink-soft font-mono">{members.data?.length ?? 0}</div>
            </div>
            {members.isLoading ? (
              <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
            ) : members.data && members.data.length > 0 ? (
              members.data.map((m) => (
                <div
                  key={m.id}
                  className="px-5 py-3.5 border-t border-border first:border-t-0 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[14px] font-medium text-ink">{m.name ?? m.email}</div>
                    <div className="text-[12px] text-ink-mute">{m.email}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-mono text-ink-mute bg-surface-mute px-2 py-0.5 rounded">
                    {m.role}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">No members yet.</div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Pending invitations</div>
              <div className="text-[11px] text-ink-soft font-mono">{pending.data?.length ?? 0}</div>
            </div>
            {pending.data && pending.data.length > 0 ? (
              pending.data.map((p) => (
                <div
                  key={p.id}
                  className="px-5 py-3.5 border-t border-border first:border-t-0 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[14px] font-medium text-ink">{p.email}</div>
                    <div className="text-[12px] text-ink-mute">
                      Invited as {p.role} · expires{' '}
                      {p.expiresAt
                        ? p.expiresAt.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-[12px] text-ink-mute hover:text-danger"
                    onClick={() => cancelInvite(p.id)}
                    disabled={isPending}
                  >
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">No pending invites.</div>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 space-y-3 h-fit">
          <div className="text-[11px] uppercase tracking-wider text-ink-soft font-mono">
            Invite a teammate
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invemail">Email</Label>
            <Input
              id="invemail"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invrole">Role</Label>
            <select
              id="invrole"
              className="w-full text-[13px] bg-surface border border-border rounded-md px-2.5 py-1.5 text-ink"
              value={role}
              onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
          {info && <div className="text-[12px] text-success">{info}</div>}
          <Button onClick={invite} disabled={isPending} className="w-full">
            {isPending ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
