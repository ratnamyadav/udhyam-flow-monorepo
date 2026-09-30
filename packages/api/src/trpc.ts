import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@udyamflow/auth';
import { db, schema } from '@udyamflow/db';
import { and, asc, eq } from 'drizzle-orm';
import superjson from 'superjson';
import { ZodError } from 'zod';

export type Context = {
  db: typeof db;
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  headers: Headers;
};

export async function createTRPCContext(opts: { headers: Headers }): Promise<Context> {
  const session = await auth.api.getSession({ headers: opts.headers });
  return { db, session, headers: opts.headers };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.session.user } });
});

export type TenantRole = 'owner' | 'admin' | 'member';

// Resolves the caller's organization and verifies they're still a member —
// a session's `activeOrganizationId` can outlive the membership (removed
// from the team) and must not keep granting access. Sessions without an
// active org (older sessions, mobile) fall back to the user's first
// membership rather than failing closed.
export const tenantProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const activeOrgId = ctx.session.session.activeOrganizationId ?? null;
  const memberships = await ctx.db
    .select({ organizationId: schema.member.organizationId, role: schema.member.role })
    .from(schema.member)
    .where(
      activeOrgId
        ? and(eq(schema.member.userId, ctx.user.id), eq(schema.member.organizationId, activeOrgId))
        : eq(schema.member.userId, ctx.user.id),
    )
    .orderBy(asc(schema.member.createdAt))
    .limit(1);
  const membership = memberships[0];
  if (!membership) {
    throw new TRPCError({
      code: activeOrgId ? 'FORBIDDEN' : 'PRECONDITION_FAILED',
      message: activeOrgId
        ? 'You are no longer a member of this workspace.'
        : 'No active organization. Run onboarding first.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      organizationId: membership.organizationId,
      role: membership.role as TenantRole,
    },
  });
});

// Owner/admin-only mutations: settings, payments, catalog, refunds.
export const tenantAdminProcedure = tenantProcedure.use(({ ctx, next }) => {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only owners and admins can do this.' });
  }
  return next();
});

// Platform staff (the internal admin app). `user.role` is a server-only
// field — BetterAuth's `input: false` stops users from setting it.
export const platformAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if ((ctx.user as { role?: string }).role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admins only.' });
  }
  return next();
});
