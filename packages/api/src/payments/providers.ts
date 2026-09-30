import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { decrypt } from '../crypto';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// How long a paid booking holds its slot while the customer is at checkout.
// Stripe Checkout sessions must live at least 30 minutes, so the hold is a
// little longer than the session to absorb webhook latency.
export const CHECKOUT_SESSION_MINUTES = 31;
export const HOLD_MINUTES = 35;

let _stripe: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

// ─── Cashfree ────────────────────────────────────────────────────────────

export type CashfreeCreds = {
  clientId: string;
  clientSecret: string;
  // Stored on the booking (`payment_account_id`) so refunds and webhook
  // verification use the same credentials that created the order.
  accountTag: 'tenant' | null;
};

function platformCashfreeCreds(): CashfreeCreds | null {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret, accountTag: null } : null;
}

async function tenantCashfreeCreds(db: Db, organizationId: string): Promise<CashfreeCreds | null> {
  const [t] = await db
    .select({
      clientId: schema.tenantSettings.cashfreeMerchantId,
      secret: schema.tenantSettings.cashfreeApiKey,
    })
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, organizationId));
  if (!t?.clientId || !t.secret) return null;
  return { clientId: t.clientId, clientSecret: decrypt(t.secret), accountTag: 'tenant' };
}

// Tenant's own Cashfree account when configured, else the platform's.
export async function cashfreeCredsForOrg(
  db: Db,
  organizationId: string,
): Promise<CashfreeCreds | null> {
  return (await tenantCashfreeCreds(db, organizationId)) ?? platformCashfreeCreds();
}

// The credentials a specific booking's order was created with.
export async function cashfreeCredsForBooking(
  db: Db,
  booking: { organizationId: string; paymentAccountId: string | null },
): Promise<CashfreeCreds | null> {
  return booking.paymentAccountId === 'tenant'
    ? tenantCashfreeCreds(db, booking.organizationId)
    : platformCashfreeCreds();
}

// Every secret that may legitimately sign a Cashfree webhook for this org.
export async function cashfreeWebhookSecrets(db: Db, organizationId: string): Promise<string[]> {
  const secrets: string[] = [];
  const tenant = await tenantCashfreeCreds(db, organizationId);
  if (tenant) secrets.push(tenant.clientSecret);
  const platform = platformCashfreeCreds();
  if (platform) secrets.push(platform.clientSecret);
  return secrets;
}

function cashfreeBase(): string {
  return process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

export function cashfreeCheckoutUrl(paymentSessionId: string): string {
  const host =
    process.env.CASHFREE_ENV === 'production'
      ? 'https://payments.cashfree.com'
      : 'https://payments-test.cashfree.com';
  return `${host}/order/#${paymentSessionId}`;
}

function cashfreeHeaders(creds: CashfreeCreds) {
  return {
    'x-client-id': creds.clientId,
    'x-client-secret': creds.clientSecret,
    'x-api-version': '2023-08-01',
    'Content-Type': 'application/json',
  };
}

// Cashfree order ids must be unique per merchant, and a customer may need a
// second attempt for the same booking — so the order id is the booking id
// plus an attempt suffix. Webhooks map back with `bookingIdFromOrderId`.
export function cashfreeOrderId(bookingId: string): string {
  return `${bookingId}__${Date.now().toString(36)}`;
}

export function bookingIdFromOrderId(orderId: string): string {
  return orderId.split('__')[0] ?? orderId;
}

export async function cashfreeCreateOrder(
  creds: CashfreeCreds,
  args: {
    orderId: string;
    amountCents: number;
    currency: string;
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    returnUrl: string;
    expiresAt: Date;
  },
): Promise<{ paymentSessionId: string }> {
  const res = await fetch(`${cashfreeBase()}/orders`, {
    method: 'POST',
    headers: cashfreeHeaders(creds),
    body: JSON.stringify({
      order_id: args.orderId,
      // Cashfree takes major units (rupees), we store minor units (paise).
      order_amount: args.amountCents / 100,
      order_currency: args.currency,
      order_expiry_time: args.expiresAt.toISOString(),
      customer_details: {
        customer_id: args.customerId,
        customer_name: args.customerName,
        customer_email: args.customerEmail ?? 'noemail@example.com',
        customer_phone: args.customerPhone?.replace(/\D/g, '').slice(-10) || '0000000000',
      },
      order_meta: { return_url: args.returnUrl },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cashfree create-order failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { payment_session_id: string };
  return { paymentSessionId: json.payment_session_id };
}

export async function cashfreeRefund(
  creds: CashfreeCreds,
  args: { orderId: string; amountCents: number; refundId: string },
): Promise<void> {
  const res = await fetch(`${cashfreeBase()}/orders/${encodeURIComponent(args.orderId)}/refunds`, {
    method: 'POST',
    headers: cashfreeHeaders(creds),
    body: JSON.stringify({
      refund_amount: args.amountCents / 100,
      refund_id: args.refundId,
      refund_note: 'Refund from UdyamFlow dashboard',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cashfree refund failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

// ─── Routing ─────────────────────────────────────────────────────────────

// Services priced in INR go through Cashfree (best UPI / Indian-banking
// coverage); everything else routes to Stripe.
export async function pickProvider(
  db: Db,
  organizationId: string,
  currency: string,
): Promise<'stripe' | 'cashfree' | 'none'> {
  if (currency.toUpperCase() === 'INR') {
    return (await cashfreeCredsForOrg(db, organizationId)) ? 'cashfree' : 'none';
  }
  return getStripe() ? 'stripe' : 'none';
}

// The tenant's Connect account, if onboarding finished; otherwise checkout
// settles to the platform account.
export async function stripeConnectAccountFor(
  db: Db,
  organizationId: string,
): Promise<string | undefined> {
  const [tenant] = await db
    .select({
      accountId: schema.tenantSettings.stripeAccountId,
      chargesEnabled: schema.tenantSettings.stripeChargesEnabled,
    })
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, organizationId));
  return tenant?.accountId && tenant.chargesEnabled ? tenant.accountId : undefined;
}
