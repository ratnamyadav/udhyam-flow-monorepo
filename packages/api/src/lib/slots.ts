import { minutesToHHmm, wallTimeToUtc } from './time';

// A slot returned to the booking page. `start`/`end` are the canonical UTC ISO
// strings the create mutation expects; `displayTime` is the HH:mm in the
// location's timezone for rendering.
export type Slot = { start: string; end: string; displayTime: string };

export type Interval = { start: Date; end: Date };

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

// Pure slot generator: candidate starts every `slotMin` minutes inside the
// working window, dropping anything already started and anything that
// overlaps an existing booking (not just identical start times — a 60-min
// booking at 10:00 also blocks a 10:30 slot).
export function generateSlots(args: {
  date: string;
  timezone: string;
  openMin: number;
  closeMin: number;
  slotMin: number;
  taken: Interval[];
  now: Date;
}): Slot[] {
  const { date, timezone, openMin, closeMin, slotMin, taken, now } = args;
  if (slotMin <= 0) return [];
  const slots: Slot[] = [];
  for (let m = openMin; m + slotMin <= closeMin; m += slotMin) {
    const start = wallTimeToUtc(date, m, timezone);
    const end = new Date(start.getTime() + slotMin * 60_000);
    if (start <= now) continue;
    if (taken.some((t) => overlaps(t, { start, end }))) continue;
    slots.push({
      start: start.toISOString(),
      end: end.toISOString(),
      displayTime: minutesToHHmm(m),
    });
  }
  return slots;
}
