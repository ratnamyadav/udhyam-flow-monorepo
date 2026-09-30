'use client';

import { authClient } from '@udyamflow/auth/client';
import { Button, Input, Label } from '@udyamflow/ui';
import { useState, useTransition } from 'react';
import { MemberNote, useActiveRole } from '@/components/app-shell/use-role';
import { trpc } from '@/lib/trpc/react';

type Role = 'member' | 'admin' | 'owner';

// BetterAuth's client returns `{ data, error }` and doesn't throw on API
// errors — normalise both shapes into a message (or null on success).
function errorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message || fallback;
  }
  return fallback;
}

export default function TeamSettingsPage() {
  const utils = trpc.useUtils();
  const { isAdmin, role: myRole, organizationId } = useActiveRole();
  const session = authClient.useSession();
  const myUserId = session.data?.user?.id ?? null;
  const members = trpc.team.listMembers.useQuery();
  const pending = trpc.team.listPendingInvitations.useQuery();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Run a BetterAuth org call, surface `error`, refresh lists on success.
  function run(
    action: () => Promise<{ error?: unknown } | null | undefined>,
    fallback: string,
    onOk?: () => void,
  ) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res?.error) {
          setError(errorMessage(res.error, fallback));
          return;
        }
        onOk?.();
        await Promise.all([
          utils.team.listMembers.invalidate(),
          utils.team.listPendingInvitations.invalidate(),
        ]);
      } catch (e) {
        setError(errorMessage(e, fallback));
      }
    });
  }

  function invite() {
    if (!email.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    run(
      () =>
        authClient.organization.inviteMember({
          email: email.trim(),
          role,
          organizationId: organizationId ?? undefined,
        }),
      'Could not send invitation',
      () => {
        setEmail('');
        setInfo('Invitation sent.');
      },
    );
  }

  function cancelInvite(invitationId: string) {
    run(
      () => authClient.organization.cancelInvitation({ invitationId }),
      'Could not cancel invitation',
    );
  }

  function removeMember(memberId: string, label: string) {
    if (!confirm(`Remove ${label} from this workspace?`)) return;
    run(
      () =>
        authClient.organization.removeMember({
          memberIdOrEmail: memberId,
          organizationId: organizationId ?? undefined,
        }),
      'Could not remove member',
      () => setInfo(`${label} was removed.`),
    );
  }

  function changeRole(memberId: string, nextRole: 'member' | 'admin') {
    run(
      () =>
        authClient.organization.updateMemberRole({
          memberId,
          role: nextRole,
          organizationId: organizationId ?? undefined,
        }),
      'Could not change role',
    );
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

      {!isAdmin && <MemberNote what="invite, remove or change the role of teammates" />}
      {error && (
        <div className="mb-4 text-[12px] text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2 max-w-[640px]">
          {error}
        </div>
      )}
      {info && <div className="mb-4 text-[12px] text-success">{info}</div>}

      <div className={isAdmin ? 'grid grid-cols-[1fr_360px] gap-6' : 'grid gap-6'}>
        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Members</div>
              <div className="text-[11px] text-ink-soft font-mono">{members.data?.length ?? 0}</div>
            </div>
            {members.isLoading ? (
              <div className="p-8 text-center text-[13px] text-ink-mute">Loading…</div>
            ) : members.error ? (
              <div className="p-8 text-center text-[13px] text-danger">{members.error.message}</div>
            ) : members.data && members.data.length > 0 ? (
              members.data.map((m) => {
                const memberRole = m.role as Role;
                const isSelf = m.userId === myUserId;
                // Owners can't be demoted/removed from here; admins can't
                // manage other admins unless they're the owner.
                const canManage =
                  isAdmin &&
                  !isSelf &&
                  memberRole !== 'owner' &&
                  (myRole === 'owner' || memberRole === 'member');
                const label = m.name ?? m.email;
                return (
                  <div
                    key={m.id}
                    className="px-5 py-3.5 border-t border-border first:border-t-0 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-[14px] font-medium text-ink">
                        {label}
                        {isSelf && <span className="text-ink-soft font-normal"> (you)</span>}
                      </div>
                      <div className="text-[12px] text-ink-mute">{m.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canManage ? (
                        <select
                          aria-label={`Role for ${label}`}
                          className="text-[12px] bg-surface border border-border rounded-md px-2 py-1 text-ink"
                          value={memberRole}
                          disabled={isPending}
                          onChange={(e) => changeRole(m.id, e.target.value as 'member' | 'admin')}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider font-mono text-ink-mute bg-surface-mute px-2 py-0.5 rounded">
                          {m.role}
                        </span>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="text-[12px] text-ink-mute hover:text-danger"
                          onClick={() => removeMember(m.id, label)}
                          disabled={isPending}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">No members yet.</div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-[14px] font-medium text-ink">Pending invitations</div>
              <div className="text-[11px] text-ink-soft font-mono">{pending.data?.length ?? 0}</div>
            </div>
            {pending.error ? (
              <div className="p-8 text-center text-[13px] text-danger">{pending.error.message}</div>
            ) : pending.data && pending.data.length > 0 ? (
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
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-[12px] text-ink-mute hover:text-danger"
                      onClick={() => cancelInvite(p.id)}
                      disabled={isPending}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[13px] text-ink-mute">No pending invites.</div>
            )}
          </div>
        </div>

        {isAdmin && (
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
            <Button onClick={invite} disabled={isPending} className="w-full">
              {isPending ? 'Working…' : 'Send invitation'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
