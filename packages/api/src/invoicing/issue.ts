// DB-aware invoicing orchestration shared by the tRPC router and the
// payment webhooks (auto-invoice). Provider adapters stay DB-free.

import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, eq, inArray } from 'drizzle-orm';
import { decrypt, encrypt } from '../crypto';
import { getStripe } from '../stripe';
import {
  exchangeFreshbooksToken,
  FreshBooksClient,
  FreshBooksError,
  freshbooksConfig,
} from './freshbooks';
import { verifyOAuthState } from './oauth-state';
import { issueStripeInvoice, mapStripeInvoiceStatus } from './stripe';
import {
  DEFAULT_DUE_DAYS,
  type InvoiceDraft,
  type InvoiceProvider,
  type StripeInvoiceLike,
} from './types';

// A `pending` claim older than this is assumed orphaned (process died
// mid-call) and may be reclaimed.
const STALE_CLAIM_MS = 5 * 60 * 1000;
// Refresh FreshBooks tokens a little before they actually expire.
const REFRESH_SKEW_MS = 2 * 60 * 1000;

export async function requireOrgAdmin(db: Db, organizationId: string, userId: string) {
  const [m] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)));
  if (!m || !['owner', 'admin'].includes(m.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only owners and admins can change invoicing settings',
    });
  }
}

export async function getConnection(db: Db, organizationId: string, provider: string) {
  const [row] = await db
    .select()
    .from(schema.integrationConnection)
    .where(
      and(
        eq(schema.integrationConnection.organizationId, organizationId),
        eq(schema.integrationConnection.provider, provider),
      ),
    );
  return row ?? null;
}

// Returns a valid FreshBooks access token + account id, refreshing (and
// persisting the rotated refresh token) when needed.
async function getFreshbooksSession(db: Db, organizationId: string) {
  const cfg = freshbooksConfig();
  if (!cfg) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'FreshBooks is not configured' });
  }
  const conn = await getConnection(db, organizationId, 'freshbooks');
  if (!conn?.externalAccountId) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Connect FreshBooks first' });
  }
  const fresh =
    conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - REFRESH_SKEW_MS > Date.now();
  if (fresh || !conn.refreshToken) {
    return { accessToken: decrypt(conn.accessToken), accountId: conn.externalAccountId };
  }

  try {
    const tokens = await exchangeFreshbooksToken({
      ...cfg,
      refreshToken: decrypt(conn.refreshToken),
    });
    // Conditional on the refresh token we used, so a concurrent refresher
    // that already rotated it doesn't get clobbered.
    await db
      .update(schema.integrationConnection)
      .set({
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.integrationConnection.id, conn.id),
          eq(schema.integrationConnection.refreshToken, conn.refreshToken),
        ),
      );
    return { accessToken: tokens.accessToken, accountId: conn.externalAccountId };
  } catch (err) {
    // Refresh tokens are single-use. If another request rotated it first,
    // its new access token is already in the DB — use that.
    const latest = await getConnection(db, organizationId, 'freshbooks');
    if (
      latest &&
      latest.refreshToken !== conn.refreshToken &&
      latest.accessTokenExpiresAt &&
      latest.accessTokenExpiresAt.getTime() > Date.now()
    ) {
      return { accessToken: decrypt(latest.accessToken), accountId: conn.externalAccountId };
    }
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'FreshBooks session expired — reconnect FreshBooks in Settings → Invoicing',
      cause: err,
    });
  }
}

async function findInvoiceForBooking(db: Db, bookingId: string) {
  const [row] = await db
    .select()
    .from(schema.invoice)
    .where(eq(schema.invoice.bookingId, bookingId));
  return row ?? null;
}

export async function issueInvoiceForBooking(
  db: Db,
  args: { organizationId: string; bookingId: string; send: boolean },
) {
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.id, args.bookingId),
        eq(schema.booking.organizationId, args.organizationId),
      ),
    );
  if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

  const existing = await findInvoiceForBooking(db, booking.id);
  if (existing) {
    const stale =
      existing.status === 'pending' && existing.updatedAt.getTime() < Date.now() - STALE_CLAIM_MS;
    if (!stale) return existing;
    await db
      .delete(schema.invoice)
      .where(and(eq(schema.invoice.id, existing.id), eq(schema.invoice.status, 'pending')));
  }

  const [settings] = await db
    .select({
      invoiceProvider: schema.tenantSettings.invoiceProvider,
      stripeAccountId: schema.tenantSettings.stripeAccountId,
      stripeChargesEnabled: schema.tenantSettings.stripeChargesEnabled,
    })
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, args.organizationId));
  const provider = (settings?.invoiceProvider ?? 'none') as InvoiceProvider;
  if (provider === 'none') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Pick an invoicing provider in Settings → Invoicing first',
    });
  }

  const [svc] = booking.serviceId
    ? await db.select().from(schema.service).where(eq(schema.service.id, booking.serviceId))
    : [];
  if (!svc || svc.priceCents <= 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This booking has nothing to invoice' });
  }

  // Claim the booking's invoice slot before touching the provider. The
  // unique index on booking_id makes concurrent issuers lose here instead
  // of creating two invoices upstream.
  const id = randomUUID();
  const [claimed] = await db
    .insert(schema.invoice)
    .values({
      id,
      organizationId: args.organizationId,
      bookingId: booking.id,
      customerId: booking.customerId,
      provider,
      status: 'pending',
      amountCents: svc.priceCents,
      currency: svc.currency,
    })
    .onConflictDoNothing({ target: schema.invoice.bookingId })
    .returning();
  if (!claimed) {
    const winner = await findInvoiceForBooking(db, booking.id);
    if (winner) return winner;
    throw new TRPCError({ code: 'CONFLICT', message: 'Invoice is already being created' });
  }

  const draft: InvoiceDraft = {
    bookingId: booking.id,
    organizationId: args.organizationId,
    customer: {
      name: booking.customerName,
      email: booking.customerEmail,
      phone: booking.customerPhone,
    },
    line: {
      name: svc.name,
      description: `${booking.slotStart.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      amountCents: svc.priceCents,
    },
    currency: svc.currency.toUpperCase(),
    alreadyPaid:
      booking.paymentStatus === 'paid' ? { via: booking.paymentProvider ?? 'online' } : null,
    send: args.send,
    dueDays: DEFAULT_DUE_DAYS,
  };

  try {
    let issued: Awaited<ReturnType<typeof issueStripeInvoice>>;
    if (provider === 'stripe') {
      const stripe = getStripe();
      if (!stripe || !settings?.stripeAccountId || !settings.stripeChargesEnabled) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Finish Stripe onboarding in Settings → Payments to use Stripe invoicing',
        });
      }
      issued = await issueStripeInvoice(stripe, settings.stripeAccountId, draft);
    } else {
      const session = await getFreshbooksSession(db, args.organizationId);
      issued = await new FreshBooksClient(session.accessToken).issueInvoice(
        session.accountId,
        draft,
      );
    }

    const [row] = await db
      .update(schema.invoice)
      .set({ ...issued, updatedAt: new Date() })
      .where(eq(schema.invoice.id, id))
      .returning();
    return row!;
  } catch (err) {
    // Release the claim so the user can retry.
    await db.delete(schema.invoice).where(eq(schema.invoice.id, id));
    if (err instanceof TRPCError) throw err;
    if (err instanceof FreshBooksError && err.status === 401) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'FreshBooks rejected our credentials — reconnect FreshBooks in Settings → Invoicing',
        cause: err,
      });
    }
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Couldn't create the invoice: ${(err as Error).message}`,
      cause: err,
    });
  }
}

// Called from payment webhooks once a booking is paid. Never throws — a
// failed auto-invoice must not fail the webhook (the payment still counts);
// the tenant can issue it manually from the bookings page.
export async function autoInvoiceIfEnabled(db: Db, bookingId: string) {
  try {
    const [row] = await db
      .select({
        organizationId: schema.booking.organizationId,
        autoInvoice: schema.tenantSettings.autoInvoice,
        invoiceProvider: schema.tenantSettings.invoiceProvider,
      })
      .from(schema.booking)
      .innerJoin(
        schema.tenantSettings,
        eq(schema.tenantSettings.organizationId, schema.booking.organizationId),
      )
      .where(eq(schema.booking.id, bookingId));
    if (!row?.autoInvoice || row.invoiceProvider === 'none') return;
    await issueInvoiceForBooking(db, {
      organizationId: row.organizationId,
      bookingId,
      send: true,
    });
  } catch (err) {
    console.error(`[invoicing] auto-invoice failed for booking ${bookingId}:`, err);
  }
}

// Mirrors a Stripe-generated invoice (Checkout `invoice_creation`) into our
// table. Upserts so it also fills in a claim left by a racing auto-invoice.
export async function recordStripeInvoice(
  db: Db,
  args: { organizationId: string; bookingId: string; invoice: StripeInvoiceLike },
) {
  const inv = args.invoice;
  const values = {
    externalId: inv.id!,
    number: inv.number ?? null,
    status: mapStripeInvoiceStatus(inv.status),
    hostedUrl: inv.hosted_invoice_url ?? null,
    amountCents: inv.total,
    currency: inv.currency.toUpperCase(),
    provider: 'stripe',
    updatedAt: new Date(),
  };
  await db
    .insert(schema.invoice)
    .values({
      id: randomUUID(),
      organizationId: args.organizationId,
      bookingId: args.bookingId,
      ...values,
    })
    .onConflictDoUpdate({ target: schema.invoice.bookingId, set: values });
}

// Stripe `invoice.paid` / `invoice.voided` etc. Keeps our mirror (and the
// booking's payment status, for invoices that were sent unpaid) in sync.
export async function syncStripeInvoiceStatus(db: Db, inv: StripeInvoiceLike) {
  if (!inv.id) return;
  const status = mapStripeInvoiceStatus(inv.status);
  const [row] = await db
    .update(schema.invoice)
    .set({ status, hostedUrl: inv.hosted_invoice_url ?? null, updatedAt: new Date() })
    .where(and(eq(schema.invoice.provider, 'stripe'), eq(schema.invoice.externalId, inv.id)))
    .returning({ bookingId: schema.invoice.bookingId });
  if (row && status === 'paid') {
    await db
      .update(schema.booking)
      .set({ paymentStatus: 'paid', paymentProvider: 'stripe', paymentId: inv.id })
      .where(
        and(
          eq(schema.booking.id, row.bookingId),
          inArray(schema.booking.paymentStatus, ['unpaid', 'pending', 'failed']),
        ),
      );
  }
}

// OAuth callback: exchange the code, pick the FreshBooks business, store
// encrypted tokens, and make FreshBooks the tenant's invoice provider if
// they hadn't chosen one yet.
export async function completeFreshbooksConnection(
  db: Db,
  args: { code: string; state: string; userId: string },
) {
  const cfg = freshbooksConfig();
  if (!cfg) throw new Error('FreshBooks is not configured');
  const { organizationId } = verifyOAuthState(args.state, args.userId);
  await requireOrgAdmin(db, organizationId, args.userId);

  const tokens = await exchangeFreshbooksToken({ ...cfg, code: args.code });
  const businesses = await new FreshBooksClient(tokens.accessToken).listBusinesses();
  const business = businesses[0];
  if (!business) {
    throw new Error('That FreshBooks login has no business with accounting access');
  }

  const values = {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiresAt,
    externalAccountId: business.accountId,
    externalBusinessId: business.businessId,
    displayName: business.name,
    connectedByUserId: args.userId,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.integrationConnection)
    .values({ id: randomUUID(), organizationId, provider: 'freshbooks', ...values })
    .onConflictDoUpdate({
      target: [schema.integrationConnection.organizationId, schema.integrationConnection.provider],
      set: values,
    });

  await db
    .insert(schema.tenantSettings)
    .values({ organizationId, invoiceProvider: 'freshbooks' })
    .onConflictDoNothing();
  await db
    .update(schema.tenantSettings)
    .set({ invoiceProvider: 'freshbooks', updatedAt: new Date() })
    .where(
      and(
        eq(schema.tenantSettings.organizationId, organizationId),
        eq(schema.tenantSettings.invoiceProvider, 'none'),
      ),
    );

  return { organizationId, businessName: business.name };
}
