import { describe, expect, it } from 'vitest';
import {
  buildReminderMessages,
  formatWhen,
  isInReminderWindow,
  needsPayLink,
  REMINDER_PAY_TEMPLATE,
  REMINDER_TEMPLATE,
  reminderWindow,
  replyPayload,
} from '../src/whatsapp/reminders';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-01T10:00:00.000Z');

describe('reminderWindow', () => {
  it('spans 23h–25h ahead', () => {
    const { from, to } = reminderWindow(now);
    expect(from.toISOString()).toBe('2026-10-02T09:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-02T11:00:00.000Z');
  });

  it('is start-inclusive, end-exclusive', () => {
    expect(isInReminderWindow(new Date(now.getTime() + 23 * HOUR), now)).toBe(true);
    expect(isInReminderWindow(new Date(now.getTime() + 25 * HOUR), now)).toBe(false);
    expect(isInReminderWindow(new Date(now.getTime() + 22.9 * HOUR), now)).toBe(false);
  });

  it('every booking is covered by at least one hourly run (none missed)', () => {
    // Walk slot starts at 7-minute steps across two days; for each, some
    // run at an exact hour must include it.
    for (let m = 0; m < 48 * 60; m += 7) {
      const slot = new Date(now.getTime() + 24 * HOUR + m * 60_000);
      const runs = Array.from({ length: 80 }, (_, h) => new Date(now.getTime() + h * HOUR));
      expect(runs.some((r) => isInReminderWindow(slot, r))).toBe(true);
    }
  });
});

describe('needsPayLink', () => {
  it('only for unpaid, priced bookings with a gateway configured', () => {
    expect(
      needsPayLink({ paymentStatus: 'unpaid', priceCents: 50000, providerConfigured: true }),
    ).toBe(true);
    expect(
      needsPayLink({ paymentStatus: 'paid', priceCents: 50000, providerConfigured: true }),
    ).toBe(false);
    expect(
      needsPayLink({ paymentStatus: 'pending', priceCents: 50000, providerConfigured: true }),
    ).toBe(false);
    expect(needsPayLink({ paymentStatus: 'unpaid', priceCents: 0, providerConfigured: true })).toBe(
      false,
    );
    expect(
      needsPayLink({ paymentStatus: 'unpaid', priceCents: null, providerConfigured: true }),
    ).toBe(false);
    expect(
      needsPayLink({ paymentStatus: 'unpaid', priceCents: 50000, providerConfigured: false }),
    ).toBe(false);
  });
});

describe('buildReminderMessages', () => {
  const base = {
    bookingId: 'bkg_1234-abcdef',
    customerName: 'Asha Rao',
    practitioner: 'Dr. Patel',
    when: '2 Oct, 15:30',
    meetingUrl: null,
    payUrl: null,
    rebookUrl: 'https://app.test/book/patel?source=whatsapp',
  };

  it('uses the plain template with three quick replies', () => {
    const m = buildReminderMessages(base);
    expect(m.whatsapp.template).toBe(REMINDER_TEMPLATE);
    expect(m.whatsapp.params).toEqual(['Asha', 'Dr. Patel', '2 Oct, 15:30', 'Ref: ABCDEF']);
    expect(m.whatsapp.buttons).toEqual([
      { type: 'quick_reply', payload: 'confirm:bkg_1234-abcdef' },
      { type: 'quick_reply', payload: 'cancel:bkg_1234-abcdef' },
      { type: 'quick_reply', payload: 'reschedule:bkg_1234-abcdef' },
    ]);
    expect(m.sms.body).not.toContain('Pay:');
  });

  it('switches to the pay template and adds a URL button when payable', () => {
    const m = buildReminderMessages({ ...base, payUrl: 'https://app.test/pay/bkg_1234-abcdef' });
    expect(m.whatsapp.template).toBe(REMINDER_PAY_TEMPLATE);
    expect(m.whatsapp.buttons[3]).toEqual({ type: 'url', suffix: 'bkg_1234-abcdef' });
    expect(m.sms.body).toContain('Pay: https://app.test/pay/bkg_1234-abcdef');
    expect(m.sms.variables.link).toBe('https://app.test/pay/bkg_1234-abcdef');
  });

  it('puts the join link in the detail param for online sessions', () => {
    const m = buildReminderMessages({ ...base, meetingUrl: 'https://meet.jit.si/udyamflow-x' });
    expect(m.whatsapp.params[3]).toBe('Join online: https://meet.jit.si/udyamflow-x');
    expect(m.sms.body).toContain('Join: https://meet.jit.si/udyamflow-x');
  });

  it('never emits empty or multi-line params (Meta rejects them)', () => {
    const m = buildReminderMessages(base);
    for (const p of m.whatsapp.params) {
      expect(p.length).toBeGreaterThan(0);
      expect(p).not.toMatch(/[\n\t]/);
    }
  });

  it('replyPayload round-trips the booking id', () => {
    expect(replyPayload('cancel', 'bkg_x')).toBe('cancel:bkg_x');
  });
});

describe('formatWhen', () => {
  it('renders in the location timezone', () => {
    expect(formatWhen(new Date('2026-10-02T10:00:00.000Z'), 'Asia/Kolkata')).toContain('15:30');
  });

  it('falls back to UTC on an invalid timezone', () => {
    expect(formatWhen(new Date('2026-10-02T10:00:00.000Z'), 'Not/AZone')).toContain('10:00');
  });
});
