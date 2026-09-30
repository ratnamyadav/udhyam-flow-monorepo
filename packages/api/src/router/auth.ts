import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { protectedProcedure, publicProcedure, router, tenantProcedure } from '../trpc';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.session?.user ?? null),

  // Tells the sign-in / sign-up pages which social buttons to render and
  // whether a new account must verify its email before it can sign in. Cheap
  // boolean lookups — no provider secrets returned.
  providers: publicProcedure.query(() => ({
    google: !!process.env.GOOGLE_CLIENT_ID,
    // Mirrors `requireEmailVerification` in packages/auth/src/server.ts.
    emailVerificationRequired: !!process.env.RESEND_API_KEY,
  })),

  // The caller's role in the org their tenant calls resolve to — lets the
  // UI hide owner/admin-only controls (the server enforces them anyway).
  activeMembership: tenantProcedure.query(({ ctx }) => ({
    organizationId: ctx.organizationId,
    role: ctx.role,
  })),

  listOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        organizationId: schema.member.organizationId,
        role: schema.member.role,
        organization: schema.organization,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .where(eq(schema.member.userId, ctx.session.user.id));
    return memberships;
  }),
});
