import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  applyCashfreeBilling,
  BILLING_PRICES,
  billingAccessFor,
  cancelLocationSubscription,
  startLocationSubscription,
  syncStripeBilling,
  trialEnd,
} from '../billing/service';
import { normalizeIndianMobile } from '../gst/india';
import { cashfreeSubscriptionsFromEnv } from '../memberships/cashfree-subscriptions';
import { getStripe } from '../stripe';
import { router, tenantAdminProcedure, tenantProcedure } from '../trpc';

export const billingRouter = router({
  status: tenantProcedure.query(async ({ ctx }) => {
    const [org] = await ctx.db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, ctx.organizationId));
    const locations = await ctx.db
      .select()
      .from(schema.location)
      .where(
        and(
          eq(schema.location.organizationId, ctx.organizationId),
          isNull(schema.location.archivedAt),
        ),
      );
    const subscriptions = await ctx.db
      .select()
      .from(schema.locationSubscription)
      .where(eq(schema.locationSubscription.organizationId, ctx.organizationId))
      .orderBy(sql`${schema.locationSubscription.createdAt} DESC`);
    const trialUntil = trialEnd(org!.createdAt);
    return {
      trialUntil,
      prices: BILLING_PRICES,
      stripeConfigured: !!getStripe(),
      cashfreeConfigured: !!cashfreeSubscriptionsFromEnv(),
      locations: locations.map((location) => {
        const own = subscriptions.filter((sub) => sub.locationId === location.id);
        return {
          ...location,
          subscription: own[0] ?? null,
          // Same rule as the booking gate, over every row (an older
          // cancelled subscription can still hold paid time).
          access: billingAccessFor(trialUntil, own),
        };
      }),
    };
  }),
  subscribe: tenantAdminProcedure
    .input(z.object({ locationId: z.string(), phone: z.string().optional() }))
    .mutation(({ ctx, input }) => {
      const phone = input.phone ? normalizeIndianMobile(input.phone) : undefined;
      if (input.phone && !phone)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Enter a valid Indian mobile number.',
        });
      return startLocationSubscription(ctx.db, {
        orgId: ctx.organizationId,
        locationId: input.locationId,
        customer: { name: ctx.user.name, email: ctx.user.email, phone: phone ?? undefined },
      });
    }),
  cancel: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(schema.locationSubscription)
        .where(
          and(
            eq(schema.locationSubscription.id, input.id),
            eq(schema.locationSubscription.organizationId, ctx.organizationId),
          ),
        );
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      await cancelLocationSubscription(ctx.db, row);
      return { ok: true };
    }),
  authorization: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(schema.locationSubscription)
        .where(
          and(
            eq(schema.locationSubscription.id, input.id),
            eq(schema.locationSubscription.organizationId, ctx.organizationId),
          ),
        );
      if (
        !row ||
        row.provider !== 'cashfree' ||
        !row.checkoutId ||
        !['initializing', 'pending'].includes(row.status)
      )
        throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        sessionId: row.checkoutId,
        mode:
          process.env.CASHFREE_ENV === 'production'
            ? ('production' as const)
            : ('sandbox' as const),
      };
    }),
  refresh: tenantAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(schema.locationSubscription)
        .where(
          and(
            eq(schema.locationSubscription.id, input.id),
            eq(schema.locationSubscription.organizationId, ctx.organizationId),
          ),
        );
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.provider === 'cashfree') {
        const client = cashfreeSubscriptionsFromEnv();
        if (!client)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cashfree is not configured.',
          });
        const state = await client.fetchSubscription(row.id);
        await applyCashfreeBilling(ctx.db, {
          type: 'SUBSCRIPTION_STATUS_CHANGED',
          subscriptionId: row.id,
          subscriptionStatus: state.subscription_status ?? null,
          cfSubscriptionId: state.cf_subscription_id ?? null,
          nextScheduleDate: state.next_schedule_date ?? null,
          authorizationStatus: null,
          payment: null,
        });
      } else {
        const stripe = getStripe();
        if (!stripe)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Stripe is not configured.',
          });
        let id = row.providerId;
        if (!id && row.checkoutId) {
          const checkout = await stripe.checkout.sessions.retrieve(row.checkoutId);
          id =
            typeof checkout.subscription === 'string'
              ? checkout.subscription
              : (checkout.subscription?.id ?? null);
        }
        if (id)
          await syncStripeBilling(ctx.db, await stripe.subscriptions.retrieve(id), new Date());
      }
      return { ok: true };
    }),
});
