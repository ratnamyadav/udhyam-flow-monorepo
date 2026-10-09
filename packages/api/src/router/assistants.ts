import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { router, tenantProcedure } from '../trpc';

// AI assistants (MCP clients) the signed-in user connected to this workspace.
// A connection is the OAuth consent the user granted, tied to the workspace
// through its reference id.

export const assistantsRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: schema.oauthConsent.id,
        scopes: schema.oauthConsent.scopes,
        connectedAt: schema.oauthConsent.createdAt,
        name: schema.oauthClient.name,
        uri: schema.oauthClient.uri,
      })
      .from(schema.oauthConsent)
      .innerJoin(schema.oauthClient, eq(schema.oauthClient.clientId, schema.oauthConsent.clientId))
      .where(
        and(
          eq(schema.oauthConsent.userId, ctx.user.id),
          eq(schema.oauthConsent.referenceId, ctx.organizationId),
        ),
      )
      .orderBy(desc(schema.oauthConsent.createdAt));
    return rows.map(({ scopes, ...r }) => ({
      ...r,
      canMakeChanges: scopes.includes('workspace:write'),
    }));
  }),

  // Takes effect at once: the MCP route requires the consent on every call,
  // and revoked refresh tokens stop the assistant renewing its access.
  disconnect: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [consent] = await ctx.db
        .delete(schema.oauthConsent)
        .where(
          and(
            eq(schema.oauthConsent.id, input.id),
            eq(schema.oauthConsent.userId, ctx.user.id),
            eq(schema.oauthConsent.referenceId, ctx.organizationId),
          ),
        )
        .returning({ clientId: schema.oauthConsent.clientId });
      if (!consent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found.' });
      const now = new Date();
      await ctx.db
        .update(schema.oauthRefreshToken)
        .set({ revoked: now })
        .where(
          and(
            eq(schema.oauthRefreshToken.clientId, consent.clientId),
            eq(schema.oauthRefreshToken.userId, ctx.user.id),
            eq(schema.oauthRefreshToken.referenceId, ctx.organizationId),
            isNull(schema.oauthRefreshToken.revoked),
          ),
        );
      return { ok: true as const };
    }),
});
