// Shared timezone helpers for location forms. The list is intentionally short —
// the browser's own zone is always offered too, so most users see theirs.
export const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Africa/Johannesburg',
  'UTC',
] as const;

export const CURRENCIES = ['USD', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Common zones plus the browser's (and any extra, e.g. a saved value), de-duped. */
export function timezoneOptions(...extra: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const tz of [browserTimezone(), ...extra]) if (tz) set.add(tz);
  for (const tz of COMMON_TIMEZONES) set.add(tz);
  return [...set];
}

export function defaultCurrencyFor(timezone: string): Currency {
  return timezone === 'Asia/Kolkata' || timezone === 'Asia/Calcutta' ? 'INR' : 'USD';
}

/** YYYY-MM-DD for `date` as seen in `timeZone`. */
export function ymdInZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Adds whole days to a YYYY-MM-DD string (calendar arithmetic, tz-agnostic). */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatTimeInZone(date: Date | string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
  } catch {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
