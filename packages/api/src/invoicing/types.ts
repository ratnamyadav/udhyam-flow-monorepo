// Provider-agnostic shapes for issuing an invoice. Each provider adapter
// (builtin.ts, stripe.ts, freshbooks.ts, zoho.ts) takes an `InvoiceDraft`
// and returns an `IssuedInvoice`; `issue.ts` owns the DB bookkeeping.

import type { GstBreakdown } from '../gst/tax';

// 'udyamflow' is the built-in GST invoice generator (no third party).
export const INVOICE_PROVIDERS = [
  'none',
  'udyamflow',
  'stripe',
  'freshbooks',
  'zoho_books',
] as const;
export type InvoiceProvider = (typeof INVOICE_PROVIDERS)[number];

export type InvoiceStatus = 'pending' | 'draft' | 'open' | 'paid' | 'void';

// Days the customer has to pay an unpaid invoice.
export const DEFAULT_DUE_DAYS = 7;

export type InvoiceDraft = {
  bookingId: string;
  organizationId: string;
  customer: { name: string; email: string | null; phone: string | null };
  line: { name: string; description: string | null; amountCents: number };
  currency: string;
  // Booking was already paid (via Stripe / Cashfree checkout) — record the
  // payment against the invoice instead of asking the customer to pay again.
  alreadyPaid: { via: string } | null;
  // Email the invoice to the customer from the provider.
  send: boolean;
  dueDays: number;
  // Indian GST treatment, computed once in issue.ts. Providers that
  // understand GST (built-in, Zoho Books) use it; others ignore it.
  tax: {
    gst: GstBreakdown;
    sacCode: string | null;
    supplierGstin: string | null;
    customerGstin: string | null;
  };
};

export type IssuedInvoice = {
  externalId: string;
  number: string | null;
  status: Exclude<InvoiceStatus, 'pending'>;
  hostedUrl: string | null;
};

// Structural subset of Stripe.Invoice we read. Route handlers and this
// package can resolve different copies of the stripe types, so we don't
// take Stripe.Invoice directly.
export type StripeInvoiceLike = {
  id?: string;
  number: string | null;
  status: string | null;
  hosted_invoice_url?: string | null;
  total: number;
  currency: string;
};
