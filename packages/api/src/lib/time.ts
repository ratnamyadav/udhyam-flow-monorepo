import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// All booking-day math happens on calendar dates ("YYYY-MM-DD") in the
// location's timezone and is converted to UTC instants only at the edges.
// Never derive a day from `new Date()` + setHours — that's the server's
// timezone, not the tenant's.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateStr(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

// Today's calendar date in `tz`.
export function todayInTz(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, 'yyyy-MM-dd');
}

export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 0=Sun … 6=Sat. A calendar date's weekday doesn't depend on timezone.
export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function minutesToHHmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// The UTC instant of wall-clock `minutes` past midnight on `date` in `tz`.
export function wallTimeToUtc(date: string, minutes: number, tz: string): Date {
  return fromZonedTime(`${date}T${minutesToHHmm(minutes)}:00`, tz);
}

// [start, end) of a calendar day in `tz`, as UTC instants. DST-correct: a
// day can be 23 or 25 hours long.
export function dayWindowUtc(date: string, tz: string): { start: Date; end: Date } {
  return {
    start: wallTimeToUtc(date, 0, tz),
    end: wallTimeToUtc(addDaysToDate(date, 1), 0, tz),
  };
}

// First day of the week (Sunday) / month containing `date`.
export function startOfWeekDate(date: string): string {
  return addDaysToDate(date, -dayOfWeek(date));
}

export function startOfMonthDate(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function formatInTz(instant: Date, tz: string, fmt: string): string {
  return formatInTimeZone(instant, tz, fmt);
}
