import { schema } from '@udyamflow/db';
import { and, eq } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc';

// Listing members + pending invitations. Mutations (invite / cancel / accept)
// go through BetterAuth's own endpoints on the client — we don't proxy them
// through tRPC since the org plugin already exposes them at /api/auth/.

export const teamRouter = router({
  listMembers: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: schema.member.id,
        userId: schema.member.userId,
        role: schema.member.role,
        name: schema.user.name,
        email: schema.user.email,
        createdAt: schema.member.createdAt,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, ctx.organizationId)),
  ),

  listPendingInvitations: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: schema.invitation.id,
        email: schema.invitation.email,
        role: schema.invitation.role,
        status: schema.invitation.status,
        expiresAt: schema.invitation.expiresAt,
      })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, ctx.organizationId),
          eq(schema.invitation.status, 'pending'),
        ),
      ),
  ),
});
