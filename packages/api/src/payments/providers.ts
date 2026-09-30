import { type Db, schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { cashfreeConfigured } from '../cashfree';
import { getStripe } from '../stripe';

export { getStripe } from '../stripe';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// How long a paid booking holds its slot while the customer is at checkout.
// Stripe Checkout sessions must live at least 30 minutes, so the hold is a
// little longer than the session to absorb webhook latency.
export const CHECKOUT_SESSION_MINUTES = 31;
export const HOLD_MINUTES = 35;

// ─── Cashfree order ids ──────────────────────────────────────────────────

// Cashfree order ids must be unique per merchant, and a customer may need a
// second attempt for the same booking — so the order id is the booking id
// plus an attempt suffix. Webhooks map back with `bookingIdFromOrderId`.
export function cashfreeOrderId(bookingId: string): string {
  return `${bookingId}__${Date.now().toString(36)}`;
}

export function bookingIdFromOrderId(orderId: string): string {
  return orderId.split('__')[0] ?? orderId;
}

// The Cashfree order behind a booking's payment. Bookings paid before
// per-attempt order ids used the booking id itself (and stored the payment
// session id in payment_id).
export function cashfreeOrderIdFor(booking: { id: string; paymentId: string | null }): string {
  return booking.paymentId?.startsWith(`${booking.id}__`) ? booking.paymentId : booking.id;
}

// ─── Routing ─────────────────────────────────────────────────────────────

// Services priced in INR go through Cashfree (best UPI / Indian-banking
// coverage); everything else routes to Stripe. Both settle to the tenant:
// Stripe via their Connect account, Cashfree via their Easy Split vendor.
export function pickProvider(currency: string): 'stripe' | 'cashfree' | 'none' {
  if (currency.toUpperCase() === 'INR') return cashfreeConfigured() ? 'cashfree' : 'none';
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

// The tenant's Easy Split vendor once Cashfree has activated it; otherwise
// INR payments settle to the platform account.
export async function cashfreeVendorFor(
  db: Db,
  organizationId: string,
): Promise<string | undefined> {
  const [tenant] = await db
    .select({
      vendorId: schema.tenantSettings.cashfreeVendorId,
      vendorStatus: schema.tenantSettings.cashfreeVendorStatus,
    })
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, organizationId));
  return tenant?.vendorId && tenant.vendorStatus === 'ACTIVE' ? tenant.vendorId : undefined;
}
