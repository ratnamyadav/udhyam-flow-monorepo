// Pure helpers shared by the Cashfree client, the webhook handler and the
// router: status mapping, money conversion, IST timestamps and ids. Kept
// free of DB / network imports so they're trivially unit-testable.

import type {
  MembershipInterval,
  MembershipPaymentStatus,
  MembershipSubscriptionStatus,
} from '@udyamflow/db/schema';

// Cashfree subscription_status → ours. Source: Cashfree Subscriptions
// lifecycle (INITIALIZED → BANK_APPROVAL_PENDING → ACTIVE, plus hold /
// pause / terminal states). Unknown values return null so callers leave
// the stored status alone instead of guessing.
export function mapSubscriptionStatus(
  cashfreeStatus: string | null | undefined,
): MembershipSubscriptionStatus | null {
  switch (cashfreeStatus?.toUpperCase()) {
    case 'INITIALIZED':
      return 'initialized';
    case 'BANK_APPROVAL_PENDING':
      return 'pending_approval';
    case 'ACTIVE':
      return 'active';
    case 'ON_HOLD':
      return 'on_hold';
    case 'PAUSED':
    case 'CUSTOMER_PAUSED':
      return 'paused';
    case 'CANCELLED':
    case 'CUSTOMER_CANCELLED':
      return 'cancelled';
    case 'COMPLETED':
      return 'completed';
    case 'EXPIRED':
    case 'LINK_EXPIRED':
    case 'CARD_EXPIRED':
      return 'expired';
    default:
      return null;
  }
}

// Terminal statuses never move again — protects against out-of-order
// webhooks resurrecting a cancelled membership.
export const TERMINAL_SUBSCRIPTION_STATUSES: readonly MembershipSubscriptionStatus[] = [
  'cancelled',
  'completed',
  'expired',
  'failed',
];

export function isTerminalSubscriptionStatus(s: MembershipSubscriptionStatus): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.includes(s);
}

// Cashfree payment_status (INITIALIZED / PENDING / SUCCESS / FAILED /
// CANCELLED) → ours.
export function mapPaymentStatus(
  cashfreeStatus: string | null | undefined,
): MembershipPaymentStatus | null {
  switch (cashfreeStatus?.toUpperCase()) {
    case 'INITIALIZED':
    case 'PENDING':
      return 'pending';
    case 'SUCCESS':
      return 'paid';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return null;
  }
}

// Cashfree amounts are decimal rupees; we store integer paise.
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function rupeesToPaise(rupees: number | string | null | undefined): number | null {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const n = typeof rupees === 'number' ? rupees : Number(rupees);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Cashfree returns IST wall-clock times, often without an offset
// ("2055-08-07T10:30:46" or "2025-06-01 10:20:12"). Treat offset-less
// values as +05:30.
export function parseCashfreeTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  let v = value.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = `${v}T00:00:00`;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const d = new Date(hasOffset ? v : `${v}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toCashfreeIntervalType(interval: MembershipInterval): 'WEEK' | 'MONTH' | 'YEAR' {
  switch (interval) {
    case 'week':
      return 'WEEK';
    case 'year':
      return 'YEAR';
    default:
      return 'MONTH';
  }
}

// Cashfree plan/subscription ids allow alphanumerics, dot, hyphen and
// underscore. Our ids (`mpl_<uuid>`, `msub_<uuid>`) already qualify, and
// deriving them deterministically makes lazy plan creation idempotent.
export function cashfreePlanIdFor(planId: string): string {
  return planId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
}

// Indian mandates need a 10-digit mobile. Accepts "+91 98765 43210",
// "098765-43210", "919876543210" etc. Returns null if it isn't one.
export function normalizeIndianMobile(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function formatInterval(interval: MembershipInterval, count: number): string {
  if (count <= 1) return interval;
  return `${count} ${interval}s`;
}
