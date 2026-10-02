import type { Db } from '@udyamflow/db';
import { APIError } from 'better-auth/api';

// Business records belong to the workspace, not the user's personal account.
// Require ownership transfer/removal before deletion to avoid orphaning it.
export async function assertAccountCanBeDeleted(db: Db, userId: string): Promise<void> {
  const memberships = await db.query.member.findMany({
    columns: { role: true },
    where: (member, { eq }) => eq(member.userId, userId),
  });
  if (memberships.some((m) => m.role.split(',').includes('owner'))) {
    throw new APIError('BAD_REQUEST', {
      message:
        'Transfer workspace ownership and leave your owner memberships before deleting your account. Manage this in Settings → Team.',
    });
  }
}
