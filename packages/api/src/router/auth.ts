import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { protectedProcedure, publicProcedure, router } from '../trpc';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.session?.user ?? null),

  // Tells the sign-in / sign-up pages which social buttons to render. Cheap
  // boolean lookup — no provider auth secrets returned.
  providers: publicProcedure.query(() => ({
    google: !!process.env.GOOGLE_CLIENT_ID,
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
