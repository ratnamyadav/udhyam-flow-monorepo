import { describe, expect, it } from 'vitest';
import { generateSlots } from '../src/lib/slots';
import {
  addDaysToDate,
  dayOfWeek,
  dayWindowUtc,
  isValidDateStr,
  isValidTimeZone,
  todayInTz,
  wallTimeToUtc,
} from '../src/lib/time';

describe('time helpers', () => {
  it('derives the weekday from the calendar date, independent of timezone', () => {
    // 2026-10-05 is a Monday. The old code turned it into UTC midnight and
    // converted to America/New_York, landing on Sunday.
    expect(dayOfWeek('2026-10-05')).toBe(1);
  });

  it('computes today in the tenant timezone, not the server timezone', () => {
    const now = new Date('2026-10-05T20:00:00Z'); // 01:30 on the 6th in IST
    expect(todayInTz('Asia/Kolkata', now)).toBe('2026-10-06');
    expect(todayInTz('America/New_York', now)).toBe('2026-10-05');
  });

  it('converts wall-clock times in a timezone to UTC', () => {
    expect(wallTimeToUtc('2026-10-05', 9 * 60, 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-05T03:30:00.000Z',
    );
    expect(wallTimeToUtc('2026-10-05', 9 * 60, 'America/New_York').toISOString()).toBe(
      '2026-10-05T13:00:00.000Z',
    );
  });

  it('handles DST days (23h and 25h long)', () => {
    const spring = dayWindowUtc('2026-03-08', 'America/New_York');
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const fall = dayWindowUtc('2026-11-01', 'America/New_York');
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
  });

  it('validates dates and timezones', () => {
    expect(isValidDateStr('2026-02-29')).toBe(false);
    expect(isValidDateStr('2028-02-29')).toBe(true);
    expect(isValidDateStr('2026-1-01')).toBe(false);
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('generateSlots', () => {
  const base = {
    date: '2026-10-05',
    timezone: 'Asia/Kolkata',
    openMin: 9 * 60,
    closeMin: 12 * 60,
    slotMin: 30,
    taken: [],
    now: new Date('2026-10-01T00:00:00Z'),
  };

  it('fills the working window on the slot grid', () => {
    const slots = generateSlots(base);
    expect(slots.map((s) => s.displayTime)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
    ]);
    expect(slots[0]!.start).toBe('2026-10-05T03:30:00.000Z');
  });

  it('drops slots that overlap an existing booking, not just same-start ones', () => {
    // 60-min booking at 10:00 IST blocks both 10:00 and 10:30.
    const taken = [
      { start: new Date('2026-10-05T04:30:00Z'), end: new Date('2026-10-05T05:30:00Z') },
    ];
    const slots = generateSlots({ ...base, taken });
    expect(slots.map((s) => s.displayTime)).toEqual(['09:00', '09:30', '11:00', '11:30']);
  });

  it('drops slots that already started', () => {
    const now = new Date('2026-10-05T04:45:00Z'); // 10:15 IST
    const slots = generateSlots({ ...base, now });
    expect(slots.map((s) => s.displayTime)).toEqual(['10:30', '11:00', '11:30']);
  });

  it('never emits a slot running past closing time', () => {
    // 11:15 + 45 ends exactly at 12:00 (allowed); 12:00 would end at 12:45.
    expect(generateSlots({ ...base, slotMin: 45 }).map((s) => s.displayTime)).toEqual([
      '09:00',
      '09:45',
      '10:30',
      '11:15',
    ]);
    expect(generateSlots({ ...base, slotMin: 50 }).at(-1)?.displayTime).toBe('10:40');
  });
});
