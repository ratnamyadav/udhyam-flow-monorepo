// Built-in invoicing via Stripe Invoicing, issued on the tenant's own
// Connect account (`stripeAccount` request option) so the invoice carries
// their branding and payouts. No extra signup for the tenant — if they've
// connected Stripe for checkout, they have invoicing.
//
// Two paths create Stripe invoices:
//   1. Checkout with `invoice_creation` (payment.ts) — Stripe generates a
//      paid invoice for the checkout; the webhook records it via
//      `recordStripeInvoice`. This is the preferred path for card payments.
//   2. `issueStripeInvoice` below — for manual invoices, unpaid bookings, or
//      bookings paid through another gateway (Cashfree), which we mark
//      `paid_out_of_band`.

import type Stripe from 'stripe';
import type { InvoiceDraft, IssuedInvoice } from './types';

export function mapStripeInvoiceStatus(s: string | null): IssuedInvoice['status'] {
  switch (s) {
    case 'paid':
      return 'paid';
    case 'void':
    case 'uncollectible':
      return 'void';
    case 'open':
      return 'open';
    default:
      return 'draft';
  }
}

async function findOrCreateCustomer(
  stripe: Stripe,
  opts: Stripe.RequestOptions,
  draft: InvoiceDraft,
): Promise<string> {
  const { name, email, phone } = draft.customer;
  if (email) {
    const existing = await stripe.customers.list({ email, limit: 1 }, opts);
    if (existing.data[0]) return existing.data[0].id;
  }
  const created = await stripe.customers.create(
    {
      name,
      email: email ?? undefined,
      phone: phone ?? undefined,
      metadata: { organizationId: draft.organizationId },
    },
    opts,
  );
  return created.id;
}

export async function issueStripeInvoice(
  stripe: Stripe,
  stripeAccount: string,
  draft: InvoiceDraft,
): Promise<IssuedInvoice> {
  const opts: Stripe.RequestOptions = { stripeAccount };
  // Stripe can only email (send_invoice) to a customer with an email.
  // Already-paid invoices don't need sending, so they can go without.
  if (!draft.alreadyPaid && !draft.customer.email) {
    throw new Error('Customer needs an email address before Stripe can send them an invoice');
  }

  const customer = await findOrCreateCustomer(stripe, opts, draft);
  const metadata = { bookingId: draft.bookingId, organizationId: draft.organizationId };

  const created = await stripe.invoices.create(
    {
      customer,
      currency: draft.currency.toLowerCase(),
      // Paid invoices use charge_automatically + auto_advance:false so
      // finalizing never tries to charge; we mark them paid out of band.
      ...(draft.alreadyPaid
        ? { collection_method: 'charge_automatically' as const }
        : { collection_method: 'send_invoice' as const, days_until_due: draft.dueDays }),
      auto_advance: false,
      pending_invoice_items_behavior: 'exclude',
      metadata,
    },
    opts,
  );
  const invoiceId = created.id!;

  await stripe.invoiceItems.create(
    {
      customer,
      invoice: invoiceId,
      amount: draft.line.amountCents,
      currency: draft.currency.toLowerCase(),
      description: draft.line.description
        ? `${draft.line.name} — ${draft.line.description}`
        : draft.line.name,
      metadata,
    },
    opts,
  );

  let inv = await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: false }, opts);
  if (draft.alreadyPaid) {
    inv = await stripe.invoices.pay(invoiceId, { paid_out_of_band: true }, opts);
  } else if (draft.send) {
    inv = await stripe.invoices.sendInvoice(invoiceId, {}, opts);
  }

  return {
    externalId: invoiceId,
    number: inv.number ?? null,
    status: mapStripeInvoiceStatus(inv.status),
    hostedUrl: inv.hosted_invoice_url ?? null,
  };
}
