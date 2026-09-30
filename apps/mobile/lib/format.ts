// Date / money formatting helpers. Booking times are always rendered in the
// booking location's timezone (not the device's), matching the web app.

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function format(
  value: DateInput,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  const date = toDate(value);
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date);
  } catch {
    // Unknown / unsupported timezone — fall back to device time.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/** "14:30" in the given timezone. */
export function formatTime(value: DateInput, timeZone?: string) {
  return format(value, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Tue, 6 Oct" in the given timezone. */
export function formatDay(value: DateInput, timeZone?: string) {
  return format(value, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Tue, 6 Oct, 14:30" in the given timezone. */
export function formatDateTime(value: DateInput, timeZone?: string) {
  return format(value, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Today's calendar date ("YYYY-MM-DD") in the given timezone. */
export function todayInTimeZone(timeZone?: string): string {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fall through
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Adds whole days to a "YYYY-MM-DD" calendar date. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days, 12));
  return date.toISOString().slice(0, 10);
}

/** Label for a "YYYY-MM-DD" calendar date, e.g. { weekday: 'Tue', day: '6', month: 'Oct' }. */
export function calendarDateParts(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  return {
    weekday: format(date, 'UTC', { weekday: 'short' }),
    day: String(d ?? ''),
    month: format(date, 'UTC', { month: 'short' }),
  };
}

export function formatMoney(amountCents: number | null | undefined, currency: string | null) {
  if (amountCents == null) return '—';
  const amount = amountCents / 100;
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
  expired: 'Expired',
  unpaid: 'Unpaid',
  pending: 'Pending',
  paid: 'Paid',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  failed: 'Failed',
};

/** Human label for a booking / payment status. */
export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}
