// GST registration limit by annual turnover. Pure + unit-tested.
//
// A service business must register for GST once its aggregate turnover in
// a financial year crosses ₹20 lakh (₹10 lakh in Manipur, Mizoram,
// Nagaland and Tripura), within 30 days. Once registered, GST applies to
// every taxable sale — so the app doesn't switch GST on by itself; it
// tracks turnover and tells unregistered stores when they must register.
// Turnover here only counts payments taken through UdyamFlow.

import { financialYear } from './tax';

export const GST_LIMIT_SERVICES_CENTS = 20_00_000_00; // ₹20 lakh
export const GST_LIMIT_SERVICES_SPECIAL_CENTS = 10_00_000_00; // ₹10 lakh
// Manipur, Mizoram, Nagaland, Tripura (GST state codes).
const LOWER_LIMIT_STATES = new Set(['13', '14', '15', '16']);
// Warn from this share of the limit.
export const APPROACHING_RATIO = 0.8;

export type LimitSource = 'store' | 'state' | 'platform' | 'statutory';

export function resolveTurnoverLimit(args: {
  storeCents: number | null | undefined;
  platformCents: number | null | undefined;
  stateCode: string | null | undefined;
}): { limitCents: number; source: LimitSource } {
  if (args.storeCents && args.storeCents > 0)
    return { limitCents: args.storeCents, source: 'store' };
  if (args.stateCode && LOWER_LIMIT_STATES.has(args.stateCode)) {
    return { limitCents: GST_LIMIT_SERVICES_SPECIAL_CENTS, source: 'state' };
  }
  if (args.platformCents && args.platformCents > 0) {
    return { limitCents: args.platformCents, source: 'platform' };
  }
  return { limitCents: GST_LIMIT_SERVICES_CENTS, source: 'statutory' };
}

export type TurnoverLevel = 'ok' | 'approaching' | 'exceeded';

export function turnoverLevel(turnoverCents: number, limitCents: number): TurnoverLevel {
  if (turnoverCents > limitCents) return 'exceeded';
  if (turnoverCents >= limitCents * APPROACHING_RATIO) return 'approaching';
  return 'ok';
}

// [start, end) of the Indian financial year containing `d`, as UTC
// instants for 1 April 00:00 IST.
export function financialYearRange(d: Date): { label: string; start: Date; end: Date } {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return {
    label: financialYear(d), // "26-27"
    start: new Date(`${y}-04-01T00:00:00+05:30`),
    end: new Date(`${y + 1}-04-01T00:00:00+05:30`),
  };
}

// "₹20 lakh", "₹12.5 lakh", "₹1.2 crore" — for limits and headline totals.
export function formatLakh(cents: number): string {
  const rupees = cents / 100;
  if (rupees >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)} crore`;
  if (rupees >= 1_00_000) return `₹${trim(rupees / 1_00_000)} lakh`;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
