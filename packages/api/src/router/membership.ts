import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { schema } from '@udyamflow/db';
import { MEMBERSHIP_INTERVALS } from '@udyamflow/db/schema';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  CashfreeApiError,
  cashfreeSubscriptionsFromEnv,
} from '../memberships/cashfree-subscriptions';
import {
  cancelSubscription,
  resolveTenantSettlement,
  startSubscription,
} from '../memberships/service';
import { isTerminalSubscriptionStatus, normalizeIndianMobile } from '../memberships/status';
import { enforceRateLimit, ipKeyFromHeaders } from '../rate-limit';
import { publicProcedure, router, tenantProcedure } from '../trpc';
import { upsertCustomer } from './customer';

// Recurring memberships billed through Cashfree Subscriptions (UPI Autopay /
// eNACH / card mandates). Tenants define plans; customers subscribe from the
// public /book/[orgSlug]/memberships page and approve a mandate once.

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function gatewayError(err: unknown): never {
  if (err instanceof CashfreeApiError) {
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Cashfree: ${err.message.replace(/^Cashfree \w+ \S+ failed \(\d+\): /, '')}`.slice(
        0,
        300,
      ),
      cause: err,
    });
  }
  throw err;
}

const planInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  // ₹1 minimum (Cashfree), ₹1,00,000 ceiling keeps mandates within
  // UPI Autopay / card limits with additional-factor auth.
  amountCents: z.number().int().min(100).max(10_000_000),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((c) => c.toUpperCase())
    .default('INR'),
  interval: z.enum(MEMBERSHIP_INTERVALS),
  intervalCount: z.number().int().min(1).max(12).default(1),
  sessionsPerCycle: z.number().int().min(1).max(365).nullable().optional(),
});

export const membershipRouter = router({
  listPlans: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(schema.membershipPlan)
      .where(eq(schema.membershipPlan.organizationId, ctx.organizationId))
      .orderBy(desc(schema.membershipPlan.active), asc(schema.membershipPlan.createdAt)),
  ),

  createPlan: tenantProcedure.input(planInput).mutation(async ({ ctx, input }) => {
    const id = `mpl_${randomUUID()}`;
    await ctx.db.insert(schema.membershipPlan).values({
      id,
      organizationId: ctx.organizationId,
      name: input.name,
      description: input.description || null,
      amountCents: input.amountCents,
      currency: input.currency,
      interval: input.interval,
      intervalCount: input.intervalCount,
      sessionsPerCycle: input.sessionsPerCycle ?? null,
    });
    return { id };
  }),

  // Amount / interval / currency are deliberately not editable: the plan
  // is immutable at Cashfree and existing mandates were approved for it.
  // To change the price, create a new plan and deactivate the old one.
  updatePlan: tenantProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(2).max(100).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, description, ...patch } = input;
      const updated = await ctx.db
        .update(schema.membershipPlan)
        .set({
          ...patch,
          ...(description !== undefined ? { description: description || null } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.membershipPlan.id, id),
            eq(schema.membershipPlan.organizationId, ctx.organizationId),
          ),
        )
        .returning({ id: schema.membershipPlan.id });
      if (updated.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
      return { ok: true };
    }),

  listSubscriptions: tenantProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: schema.membershipSubscription.id,
        status: schema.membershipSubscription.status,
        nextChargeAt: schema.membershipSubscription.nextChargeAt,
        createdAt: schema.membershipSubscription.createdAt,
        cashfreeSubscriptionId: schema.membershipSubscription.cashfreeSubscriptionId,
        customerId: schema.customer.id,
        customerName: schema.customer.name,
        customerPhone: schema.customer.phone,
        customerEmail: schema.customer.email,
        planId: schema.membershipPlan.id,
        planName: schema.membershipPlan.name,
        amountCents: schema.membershipPlan.amountCents,
        currency: schema.membershipPlan.currency,
        interval: schema.membershipPlan.interval,
        intervalCount: schema.membershipPlan.intervalCount,
      })
      .from(schema.membershipSubscription)
      .innerJoin(schema.customer, eq(schema.customer.id, schema.membershipSubscription.customerId))
      .innerJoin(
        schema.membershipPlan,
        eq(schema.membershipPlan.id, schema.membershipSubscription.planId),
      )
      .where(
        and(
          eq(schema.membershipSubscription.organizationId, ctx.organizationId),
          // Our own create failures never reached the customer — noise here.
          ne(schema.membershipSubscription.status, 'failed'),
        ),
      )
      .orderBy(desc(schema.membershipSubscription.createdAt))
      .limit(500),
  ),

  cancelSubscription: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(schema.membershipSubscription)
        .where(
          and(
            eq(schema.membershipSubscription.id, input.id),
            eq(schema.membershipSubscription.organizationId, ctx.organizationId),
          ),
        );
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (isTerminalSubscriptionStatus(row.status)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Membership is already ${row.status}`,
        });
      }
      try {
        await cancelSubscription(ctx.db, cashfreeSubscriptionsFromEnv(), row);
      } catch (err) {
        gatewayError(err);
      }
      return { ok: true };
    }),

  // --- Public (tenant booking site) ---

  publicPlans: publicProcedure
    .input(z.object({ orgSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
      const plans = await ctx.db
        .select({
          id: schema.membershipPlan.id,
          name: schema.membershipPlan.name,
          description: schema.membershipPlan.description,
          amountCents: schema.membershipPlan.amountCents,
          currency: schema.membershipPlan.currency,
          interval: schema.membershipPlan.interval,
          intervalCount: schema.membershipPlan.intervalCount,
          sessionsPerCycle: schema.membershipPlan.sessionsPerCycle,
        })
        .from(schema.membershipPlan)
        .where(
          and(
            eq(schema.membershipPlan.organizationId, org.id),
            eq(schema.membershipPlan.active, true),
          ),
        )
        .orderBy(asc(schema.membershipPlan.amountCents));
      return plans;
    }),

  subscribe: publicProcedure
    .input(
      z.object({
        orgSlug: z.string(),
        planId: z.string(),
        name: z.string().trim().min(2).max(100),
        // Cashfree requires both for mandate notifications.
        email: z.email(),
        phone: z.string().trim().min(10).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit({
        key: `membership-subscribe:${ipKeyFromHeaders(ctx.headers)}:${input.orgSlug}`,
        limit: 5,
        windowSec: 60,
        message: 'Too many sign-up attempts from your network. Please try again in a minute.',
      });

      const [org] = await ctx.db
        .select({
          id: schema.organization.id,
          slug: schema.organization.slug,
          name: schema.organization.name,
        })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });

      const [plan] = await ctx.db
        .select()
        .from(schema.membershipPlan)
        .where(
          and(
            eq(schema.membershipPlan.id, input.planId),
            eq(schema.membershipPlan.organizationId, org.id),
            eq(schema.membershipPlan.active, true),
          ),
        );
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This membership is not available' });
      }
      if (plan.currency.toUpperCase() !== 'INR') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Only INR memberships can be paid by UPI Autopay / eNACH / card mandate (this plan is in ${plan.currency}).`,
        });
      }

      const phone = normalizeIndianMobile(input.phone);
      if (!phone) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Enter a 10-digit Indian mobile number — your bank sends mandate alerts to it.',
        });
      }

      const client = cashfreeSubscriptionsFromEnv();
      if (!client) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Online memberships are not available yet. Please contact the business.',
        });
      }

      // Same rule as one-off INR checkouts (payment.ts): optionally refuse
      // until the tenant's payout vendor is active.
      if (
        process.env.CASHFREE_REQUIRE_VENDOR === 'true' &&
        !(await resolveTenantSettlement(ctx.db, org.id))
      ) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This business has not finished setting up online payments yet',
        });
      }

      const customerId = await upsertCustomer(ctx.db, org.id, {
        name: input.name,
        email: input.email,
        phone: input.phone,
      });

      try {
        return await startSubscription(ctx.db, client, {
          org,
          plan,
          customer: { id: customerId, name: input.name, email: input.email, phone },
          appUrl: appUrl(),
        });
      } catch (err) {
        gatewayError(err);
      }
    }),
});
