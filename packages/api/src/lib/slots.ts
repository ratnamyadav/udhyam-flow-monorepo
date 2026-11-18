import { formatInTz, minutesToHHmm, wallTimeToUtc } from './time';

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
  const starts = new Map<number, { start: Date; label: string }>();
  for (let m = openMin; m + slotMin <= closeMin; m += slotMin) {
    const local = `${date} ${minutesToHHmm(m)}`;
    const guessed = wallTimeToUtc(date, m, timezone);
    // Check nearby offsets as well, so both occurrences of a repeated hour
    // are offered (including half-hour DST changes). Gaps fail the round trip.
    for (let delta = -120; delta <= 120; delta += 15) {
      const start = new Date(guessed.getTime() + delta * 60_000);
      if (formatInTz(start, timezone, 'yyyy-MM-dd HH:mm') === local) {
        starts.set(start.getTime(), { start, label: minutesToHHmm(m) });
      }
    }
  }
  const labels = new Map<string, number>();
  for (const { label } of starts.values()) labels.set(label, (labels.get(label) ?? 0) + 1);
  for (const { start, label } of [...starts.values()].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  )) {
    const end = new Date(start.getTime() + slotMin * 60_000);
    if (start <= now) continue;
    const endDate = formatInTz(end, timezone, 'yyyy-MM-dd');
    const endMin =
      Number(formatInTz(end, timezone, 'H')) * 60 + Number(formatInTz(end, timezone, 'm'));
    if (endDate !== date && closeMin !== 1440) continue;
    if (endDate === date && endMin > closeMin) continue;
    if (taken.some((t) => overlaps(t, { start, end }))) continue;
    slots.push({
      start: start.toISOString(),
      end: end.toISOString(),
      displayTime:
        (labels.get(label) ?? 0) > 1 ? `${label} (${formatInTz(start, timezone, 'xxx')})` : label,
    });
  }
  return slots;
}
