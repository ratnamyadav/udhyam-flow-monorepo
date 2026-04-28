import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@udyamflow/auth';
import { db } from '@udyamflow/db';
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

export const tenantProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const orgId = ctx.session?.session?.activeOrganizationId;
  if (!orgId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'No active organization. Run onboarding first.',
    });
  }
  return next({ ctx: { ...ctx, organizationId: orgId } });
});
