'use client';

import { trpc } from '@/lib/trpc/react';

// Role of the signed-in user in the active workspace. The server enforces
// owner/admin-only mutations regardless — this only hides controls members
// can't use. While loading we assume admin so owners don't see UI flash away.
export function useActiveRole() {
  const membership = trpc.auth.activeMembership.useQuery(undefined, { staleTime: 60_000 });
  const role = membership.data?.role ?? null;
  return {
    role,
    organizationId: membership.data?.organizationId ?? null,
    isAdmin: role ? role === 'owner' || role === 'admin' : true,
    isLoading: membership.isLoading,
  };
}

export function MemberNote({ what = 'change these settings' }: { what?: string }) {
  return (
    <div className="mb-6 bg-surface border border-border rounded-md px-3 py-2 text-[12px] text-ink-mute max-w-[640px]">
      You're a member of this workspace — only owners and admins can {what}. Ask an admin if
      something needs updating.
    </div>
  );
}
