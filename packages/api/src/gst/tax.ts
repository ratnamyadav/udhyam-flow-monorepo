// GST calculation for booking invoices. Pure + unit-tested.
//
// Service prices are tax-inclusive (what the customer sees and pays at
// checkout), so we back the tax out of the total instead of adding it on.
// Intra-state supplies split tax equally into CGST + SGST; inter-state
// supplies carry IGST. Place of supply for services to an unregistered
// customer defaults to the supplier's state unless we know the customer's.

import { stateCodeFromGstin } from './india';

// GST 2.0 slabs (from 22 Sep 2025). Salons, gyms, spas and yoga are 5%
// without ITC; coaching and most other services 18%; healthcare by a
// clinical establishment is exempt.
export const GST_RATES_BPS = [0, 500, 1800, 4000] as const;

export type DocumentType = 'tax_invoice' | 'bill_of_supply' | 'invoice';

export type GstInput = {
  amountCents: number; // tax-inclusive total
  rateBps: number;
  exempt: boolean;
  supplier: { registered: boolean; gstin: string | null; stateCode: string | null };
  customer: { gstin: string | null; stateCode: string | null };
  // GST is charged only when the (tax-inclusive) amount is strictly above
  // this. null / 0 = charge on every transaction. See resolveGstThreshold.
  thresholdCents?: number | null;
};

export type GstBreakdown = {
  documentType: DocumentType;
  taxableCents: number;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  rateBps: number;
  placeOfSupply: string | null;
  interState: boolean;
  // Why no GST was charged, when that's a business rule rather than the
  // law (currently: amount at or below the configured threshold).
  note: string | null;
};

// Which threshold applies: the store's own value wins (0 = explicitly "no
// threshold"), otherwise the platform default set by UdyamFlow admins.
export function resolveGstThreshold(
  storeCents: number | null | undefined,
  platformCents: number | null | undefined,
): number | null {
  const v = storeCents ?? platformCents ?? null;
  return v && v > 0 ? v : null;
}

export function computeGst(input: GstInput): GstBreakdown {
  const supplierState =
    input.supplier.stateCode ??
    (input.supplier.gstin ? stateCodeFromGstin(input.supplier.gstin) : null);
  const customerState =
    (input.customer.gstin ? stateCodeFromGstin(input.customer.gstin) : null) ??
    input.customer.stateCode;
  const placeOfSupply = customerState ?? supplierState;
  const interState = !!supplierState && !!placeOfSupply && supplierState !== placeOfSupply;

  const noTax = {
    taxableCents: input.amountCents,
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 0,
    rateBps: 0,
    placeOfSupply,
    interState,
    note: null,
  };
  // Not in India → a plain invoice; in India but unregistered or exempt →
  // Bill of Supply (no tax may be charged on it).
  if (!supplierState) return { documentType: 'invoice', ...noTax, placeOfSupply: null };
  if (!input.supplier.registered || input.exempt || input.rateBps <= 0) {
    return { documentType: 'bill_of_supply', ...noTax };
  }
  if (input.thresholdCents && input.amountCents <= input.thresholdCents) {
    return {
      documentType: 'bill_of_supply',
      ...noTax,
      note: `GST not charged — transaction value is ₹${formatInr(input.thresholdCents)} or less.`,
    };
  }

  const taxableCents = Math.round((input.amountCents * 10_000) / (10_000 + input.rateBps));
  const taxCents = input.amountCents - taxableCents;
  if (interState) {
    return {
      documentType: 'tax_invoice',
      taxableCents,
      cgstCents: 0,
      sgstCents: 0,
      igstCents: taxCents,
      rateBps: input.rateBps,
      placeOfSupply,
      interState,
      note: null,
    };
  }
  const cgstCents = Math.floor(taxCents / 2);
  return {
    documentType: 'tax_invoice',
    taxableCents,
    cgstCents,
    sgstCents: taxCents - cgstCents,
    igstCents: 0,
    rateBps: input.rateBps,
    placeOfSupply,
    interState,
    note: null,
  };
}

// Indian financial year (April–March) in IST, as "26-27".
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return `${two(start)}-${two(start + 1)}`;
}

// "INV/26-27/0001". GST allows ≤16 chars of A-Z, 0-9, '-' and '/'.
export function formatInvoiceNumber(prefix: string, fy: string, n: number): string {
  const p = sanitizeInvoicePrefix(prefix);
  const seq = String(n).padStart(4, '0');
  const full = `${p}/${fy}/${seq}`;
  // Past 99,999 invoices a year the prefix no longer fits; drop it rather
  // than truncate the sequence (which would repeat numbers).
  return full.length <= 16 ? full : `${fy}/${seq}`;
}

export function sanitizeInvoicePrefix(raw: string): string {
  return (
    raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4) || 'INV'
  );
}

// Rupees with Indian digit grouping: 123456.5 → "1,23,456.50".
export function formatInr(cents: number): string {
  return (cents / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
