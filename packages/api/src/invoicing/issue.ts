// DB-aware invoicing orchestration shared by the tRPC router and the
// payment webhooks (auto-invoice). Provider adapters stay DB-free.

import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, eq, inArray } from 'drizzle-orm';
import { decrypt, encrypt } from '../crypto';
import { computeGst, resolveGstThreshold } from '../gst/tax';
import { refundDuplicatePayment } from '../payments/refunds';
import { getStripe } from '../stripe';
import { issueBuiltinInvoice } from './builtin';
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
  type IssuedInvoice,
  type StripeInvoiceLike,
} from './types';
import { exchangeZohoToken, isZohoHost, ZohoBooksClient, ZohoError, zohoConfig } from './zoho';

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

// Zoho access tokens last an hour; refresh tokens don't rotate, so a
// racing refresh is harmless (both get valid access tokens).
async function getZohoSession(db: Db, organizationId: string) {
  const cfg = zohoConfig();
  if (!cfg) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Zoho Books is not configured' });
  }
  const conn = await getConnection(db, organizationId, 'zoho_books');
  const apiDomain = conn?.metadata?.apiDomain;
  const accountsUrl = conn?.metadata?.accountsUrl ?? cfg.accountsUrl;
  if (!conn?.externalAccountId || !apiDomain) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Connect Zoho Books first' });
  }
  const fresh =
    conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - REFRESH_SKEW_MS > Date.now();
  if (fresh || !conn.refreshToken) {
    return { accessToken: decrypt(conn.accessToken), apiDomain, orgId: conn.externalAccountId };
  }
  try {
    const tokens = await exchangeZohoToken({
      ...cfg,
      accountsUrl,
      refreshToken: decrypt(conn.refreshToken),
    });
    await db
      .update(schema.integrationConnection)
      .set({
        accessToken: encrypt(tokens.accessToken),
        accessTokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrationConnection.id, conn.id));
    return { accessToken: tokens.accessToken, apiDomain, orgId: conn.externalAccountId };
  } catch (err) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Zoho Books session expired — reconnect Zoho Books in Settings → Invoicing',
      cause: err,
    });
  }
}

// Platform-wide default GST threshold, set by UdyamFlow admins.
export async function getPlatformGstThreshold(db: Db): Promise<number | null> {
  const [row] = await db
    .select({ cents: schema.platformSettings.gstThresholdCents })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.id, schema.PLATFORM_SETTINGS_ID));
  return row?.cents ?? null;
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
    if (!stale) {
      if (
        ['paid', 'partially_refunded'].includes(booking.paymentStatus) &&
        ['draft', 'open'].includes(existing.status)
      ) {
        await syncInvoicePayment(db, booking.id);
        return (await findInvoiceForBooking(db, booking.id)) ?? existing;
      }
      return existing;
    }
    await db
      .delete(schema.invoice)
      .where(and(eq(schema.invoice.id, existing.id), eq(schema.invoice.status, 'pending')));
  }

  const [settings] = await db
    .select({
      invoiceProvider: schema.tenantSettings.invoiceProvider,
      stripeAccountId: schema.tenantSettings.stripeAccountId,
      stripeChargesEnabled: schema.tenantSettings.stripeChargesEnabled,
      gstRegistered: schema.tenantSettings.gstRegistered,
      gstin: schema.tenantSettings.gstin,
      gstStateCode: schema.tenantSettings.gstStateCode,
      gstLegalName: schema.tenantSettings.gstLegalName,
      invoicePrefix: schema.tenantSettings.invoicePrefix,
      gstThresholdCents: schema.tenantSettings.gstThresholdCents,
      orgName: schema.organization.name,
    })
    .from(schema.tenantSettings)
    .innerJoin(
      schema.organization,
      eq(schema.organization.id, schema.tenantSettings.organizationId),
    )
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
  const amountCents = booking.amountCents ?? svc?.priceCents ?? 0;
  const currency = booking.currency ?? svc?.currency ?? 'INR';
  const service = booking.serviceSnapshot ?? svc;
  if (!service || amountCents <= 0) {
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
      amountCents: amountCents,
      currency: currency,
    })
    .onConflictDoNothing({ target: schema.invoice.bookingId })
    .returning();
  if (!claimed) {
    const winner = await findInvoiceForBooking(db, booking.id);
    if (winner) return winner;
    throw new TRPCError({ code: 'CONFLICT', message: 'Invoice is already being created' });
  }

  const [cust] = booking.customerId
    ? await db
        .select({ gstin: schema.customer.gstin, stateCode: schema.customer.stateCode })
        .from(schema.customer)
        .where(eq(schema.customer.id, booking.customerId))
    : [];
  const gst = computeGst({
    thresholdCents: resolveGstThreshold(
      settings?.gstThresholdCents,
      await getPlatformGstThreshold(db),
    ),
    amountCents: amountCents,
    rateBps: service.gstRateBps,
    exempt: service.gstExempt,
    supplier: {
      registered: !!settings?.gstRegistered,
      gstin: settings?.gstin ?? null,
      stateCode: settings?.gstStateCode ?? null,
    },
    customer: { gstin: cust?.gstin ?? null, stateCode: cust?.stateCode ?? null },
  });

  const draft: InvoiceDraft = {
    bookingId: booking.id,
    organizationId: args.organizationId,
    customer: {
      name: booking.customerName,
      email: booking.customerEmail,
      phone: booking.customerPhone,
    },
    line: {
      name: service.name,
      description: `${booking.slotStart.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      amountCents: amountCents,
    },
    currency: currency.toUpperCase(),
    alreadyPaid:
      booking.paymentStatus === 'paid' ? { via: booking.paymentProvider ?? 'online' } : null,
    send: args.send,
    dueDays: DEFAULT_DUE_DAYS,
    tax: {
      gst,
      sacCode: service.sacCode,
      supplierGstin: settings?.gstRegistered ? (settings.gstin ?? null) : null,
      customerGstin: cust?.gstin ?? null,
    },
  };

  try {
    let issued: IssuedInvoice;
    // Providers whose invoice carries our GST breakdown.
    let gstFields = {};
    if (provider === 'udyamflow') {
      issued = await issueBuiltinInvoice(
        db,
        {
          invoiceId: id,
          prefix: settings?.invoicePrefix ?? 'INV',
          businessName: settings?.gstLegalName || settings?.orgName || 'Your provider',
        },
        draft,
      );
    } else if (provider === 'zoho_books') {
      const z = await getZohoSession(db, args.organizationId);
      issued = await new ZohoBooksClient(z.accessToken, z.apiDomain).issueInvoice(z.orgId, draft);
    } else if (provider === 'stripe') {
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

    if (provider === 'udyamflow' || provider === 'zoho_books') {
      gstFields = {
        documentType: gst.documentType,
        taxableCents: gst.taxableCents,
        cgstCents: gst.cgstCents,
        sgstCents: gst.sgstCents,
        igstCents: gst.igstCents,
        gstRateBps: gst.rateBps,
        sacCode: service.sacCode,
        placeOfSupply: gst.placeOfSupply,
        supplierGstin: draft.tax.supplierGstin,
        customerGstin: draft.tax.customerGstin,
        taxNote: gst.note,
      };
    }

    const [row] = await db
      .update(schema.invoice)
      .set({ ...issued, ...gstFields, issuedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.invoice.id, id))
      .returning();
    return row!;
  } catch (err) {
    // Release the claim so the user can retry.
    await db.delete(schema.invoice).where(eq(schema.invoice.id, id));
    if (err instanceof TRPCError) throw err;
    if (err instanceof ZohoError && err.status === 401) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'Zoho Books rejected our credentials — reconnect Zoho Books in Settings → Invoicing',
        cause: err,
      });
    }
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

// A booking was paid after its invoice went out (pay-later link, or an
// invoice issued before checkout). Marks the invoice paid here and in the
// provider that issued it, so the customer isn't asked to pay twice and the
// tenant's books show the revenue. Never throws: the payment already
// counts, so a provider failure is logged and the invoice left unpaid.
export async function syncInvoicePayment(db: Db, bookingId: string): Promise<void> {
  const [row] = await db
    .select({ invoice: schema.invoice, booking: schema.booking })
    .from(schema.invoice)
    .innerJoin(schema.booking, eq(schema.booking.id, schema.invoice.bookingId))
    .where(
      and(
        eq(schema.invoice.bookingId, bookingId),
        inArray(schema.invoice.status, ['draft', 'open']),
      ),
    );
  if (!row || !['paid', 'partially_refunded'].includes(row.booking.paymentStatus)) return;
  const { invoice, booking } = row;
  // Paid through this very Stripe invoice: its own webhook marks it paid.
  if (invoice.provider === 'stripe' && booking.paymentId === invoice.externalId) return;
  if (invoice.provider !== 'udyamflow' && !invoice.externalId) return;

  // Claim it, so concurrent webhook deliveries record the payment once.
  const claimedAt = new Date();
  const [claimed] = await db
    .update(schema.invoice)
    .set({ status: 'paid', updatedAt: claimedAt })
    .where(and(eq(schema.invoice.id, invoice.id), eq(schema.invoice.status, invoice.status)))
    .returning({ id: schema.invoice.id });
  if (!claimed || invoice.provider === 'udyamflow') return;

  const externalId = invoice.externalId!;
  const payment = {
    bookingId,
    amountCents: invoice.amountCents,
    via: booking.paymentProvider ?? 'online',
  };
  try {
    if (invoice.provider === 'freshbooks') {
      const s = await getFreshbooksSession(db, booking.organizationId);
      await new FreshBooksClient(s.accessToken).recordPayment(s.accountId, externalId, payment);
    } else if (invoice.provider === 'zoho_books') {
      const z = await getZohoSession(db, booking.organizationId);
      await new ZohoBooksClient(z.accessToken, z.apiDomain).recordPayment(
        z.orgId,
        externalId,
        payment,
      );
    } else if (invoice.provider === 'stripe') {
      const stripe = getStripe();
      const [settings] = await db
        .select({ stripeAccountId: schema.tenantSettings.stripeAccountId })
        .from(schema.tenantSettings)
        .where(eq(schema.tenantSettings.organizationId, booking.organizationId));
      if (!stripe || !settings?.stripeAccountId) throw new Error('Stripe is not configured');
      await stripe.invoices.pay(
        externalId,
        { paid_out_of_band: true },
        { stripeAccount: settings.stripeAccountId },
      );
    }
  } catch (err) {
    // Release the claim (unless something else has updated it since) so a
    // manual re-issue or a later delivery can try again.
    await db
      .update(schema.invoice)
      .set({ status: invoice.status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.invoice.id, invoice.id),
          eq(schema.invoice.status, 'paid'),
          eq(schema.invoice.updatedAt, claimedAt),
        ),
      );
    console.error(
      `[invoicing] couldn't record payment on ${invoice.provider} invoice ${invoice.id}:`,
      err,
    );
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
// `account` is the webhook event's Connect account: recorded on the booking
// so a later refund goes back through the account that took the money.
export async function syncStripeInvoiceStatus(
  db: Db,
  inv: StripeInvoiceLike & {
    amount_paid?: number;
    paid_out_of_band?: boolean;
    metadata?: Record<string, string> | null;
  },
  opts: { account?: string | null } = {},
) {
  if (!inv.id) return;
  const status = mapStripeInvoiceStatus(inv.status);
  const [row] = await db
    .update(schema.invoice)
    .set({ status, hostedUrl: inv.hosted_invoice_url ?? null, updatedAt: new Date() })
    .where(and(eq(schema.invoice.provider, 'stripe'), eq(schema.invoice.externalId, inv.id)))
    .returning({ bookingId: schema.invoice.bookingId });
  if (row && status === 'paid') {
    const updated = await db
      .update(schema.booking)
      .set({
        paymentStatus: 'paid',
        paymentProvider: 'stripe',
        paymentId: inv.id,
        paymentAccountId: opts.account ?? null,
        paidAt: new Date(),
        // Snapshot what was actually charged, for refunds and revenue.
        amountCents: inv.total,
        currency: inv.currency.toUpperCase(),
      })
      .where(
        and(
          eq(schema.booking.id, row.bookingId),
          inArray(schema.booking.paymentStatus, ['unpaid', 'pending', 'failed']),
        ),
      )
      .returning({ id: schema.booking.id });
    if (updated.length) return;
    // Already settled another way (e.g. Checkout) and the customer also paid
    // this emailed invoice: refund the second charge like any duplicate.
    // Invoices Checkout generated (`attemptId`) or marked paid out of band
    // carry no money of their own.
    const charged = inv.amount_paid ?? inv.total;
    if (inv.paid_out_of_band || inv.metadata?.attemptId || charged <= 0) return;
    const [booking] = await db
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, row.bookingId));
    if (
      !booking ||
      booking.paymentId === inv.id ||
      !['paid', 'partially_refunded', 'refunded'].includes(booking.paymentStatus)
    )
      return;
    await refundDuplicatePayment(db, {
      bookingId: booking.id,
      provider: 'stripe',
      paymentId: inv.id,
      amountCents: charged,
      accountId: opts.account ?? null,
    });
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

  await setProviderIfUnset(db, organizationId, 'freshbooks');

  return { organizationId, businessName: business.name };
}

// Zoho OAuth callback. `accountsServer` comes from Zoho's redirect (the
// user's data centre) and is host-checked before we send it our secret.
export async function completeZohoConnection(
  db: Db,
  args: { code: string; state: string; userId: string; accountsServer: string | null },
) {
  const cfg = zohoConfig();
  if (!cfg) throw new Error('Zoho Books is not configured');
  const { organizationId } = verifyOAuthState(args.state, args.userId);
  await requireOrgAdmin(db, organizationId, args.userId);

  const accountsUrl =
    args.accountsServer && isZohoHost(args.accountsServer, 'accounts')
      ? args.accountsServer
      : cfg.accountsUrl;
  const tokens = await exchangeZohoToken({ ...cfg, accountsUrl, code: args.code });
  if (!tokens.refreshToken) throw new Error('Zoho did not return a refresh token — try again');
  const orgs = await new ZohoBooksClient(tokens.accessToken, tokens.apiDomain).listOrganizations();
  const org = orgs[0];
  if (!org) throw new Error('That Zoho account has no Zoho Books organization');

  const values = {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiresAt,
    externalAccountId: org.organizationId,
    externalBusinessId: null,
    displayName: org.name,
    metadata: { accountsUrl, apiDomain: tokens.apiDomain },
    connectedByUserId: args.userId,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.integrationConnection)
    .values({ id: randomUUID(), organizationId, provider: 'zoho_books', ...values })
    .onConflictDoUpdate({
      target: [schema.integrationConnection.organizationId, schema.integrationConnection.provider],
      set: values,
    });
  await setProviderIfUnset(db, organizationId, 'zoho_books');
  return { organizationId, businessName: org.name };
}

async function setProviderIfUnset(db: Db, organizationId: string, provider: string) {
  await db.insert(schema.tenantSettings).values({ organizationId }).onConflictDoNothing();
  await db
    .update(schema.tenantSettings)
    .set({ invoiceProvider: provider, updatedAt: new Date() })
    .where(
      and(
        eq(schema.tenantSettings.organizationId, organizationId),
        eq(schema.tenantSettings.invoiceProvider, 'none'),
      ),
    );
}

// Everything a public invoice page needs, by (unguessable) invoice id.
// Only built-in invoices are served — other providers host their own.
export async function getPublicInvoice(db: Db, invoiceId: string) {
  const [row] = await db
    .select({
      invoice: schema.invoice,
      booking: {
        customerName: schema.booking.customerName,
        customerEmail: schema.booking.customerEmail,
        customerPhone: schema.booking.customerPhone,
        slotStart: schema.booking.slotStart,
        serviceId: schema.booking.serviceId,
      },
      tenant: {
        name: schema.organization.name,
        legalName: schema.tenantSettings.gstLegalName,
        gstin: schema.tenantSettings.gstin,
        gstStateCode: schema.tenantSettings.gstStateCode,
        billingAddress: schema.tenantSettings.billingAddress,
        accent: schema.tenantSettings.accent,
        logoUrl: schema.tenantSettings.logoUrl,
      },
    })
    .from(schema.invoice)
    .innerJoin(schema.booking, eq(schema.booking.id, schema.invoice.bookingId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invoice.organizationId))
    .leftJoin(
      schema.tenantSettings,
      eq(schema.tenantSettings.organizationId, schema.invoice.organizationId),
    )
    .where(and(eq(schema.invoice.id, invoiceId), eq(schema.invoice.provider, 'udyamflow')));
  if (!row) return null;
  const [svc] = row.booking.serviceId
    ? await db
        .select({ name: schema.service.name })
        .from(schema.service)
        .where(eq(schema.service.id, row.booking.serviceId))
    : [];
  return { ...row, serviceName: svc?.name ?? 'Service' };
}
