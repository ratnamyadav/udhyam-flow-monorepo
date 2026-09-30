import { describe, expect, it } from 'vitest';
import {
  normalizePhoneForMatch,
  parseInboundWhatsApp,
  parseReplyPayload,
  phonesMatch,
} from '../src/whatsapp/inbound';

const ID = 'bkg_5f0c2a1e-9d4b-4c1e-8a7f-1234567890ab';

describe('parseReplyPayload', () => {
  it('parses action:bookingId', () => {
    expect(parseReplyPayload(`confirm:${ID}`)).toEqual({ action: 'confirm', bookingId: ID });
    expect(parseReplyPayload(` cancel:${ID} `)).toEqual({ action: 'cancel', bookingId: ID });
  });

  it('rejects unknown actions and junk ids', () => {
    expect(parseReplyPayload(`delete:${ID}`)).toBeNull();
    expect(parseReplyPayload('confirm:')).toBeNull();
    expect(parseReplyPayload("confirm:bkg_1' OR 1=1")).toBeNull();
    expect(parseReplyPayload('confirm')).toBeNull();
  });
});

describe('parseInboundWhatsApp', () => {
  it('MSG91 flattened shape with a button object', () => {
    expect(
      parseInboundWhatsApp({
        customerNumber: '919876543210',
        contentType: 'button',
        button: { payload: `confirm:${ID}`, text: 'Confirm' },
      }),
    ).toEqual({ from: '919876543210', action: 'confirm', bookingId: ID });
  });

  it('MSG91 with JSON-encoded messages string', () => {
    const body = {
      integratedNumber: '918000000000',
      messages: JSON.stringify([
        {
          from: '919876543210',
          type: 'button',
          button: { payload: `cancel:${ID}`, text: 'Cancel' },
        },
      ]),
    };
    expect(parseInboundWhatsApp(body)).toEqual({
      from: '919876543210',
      action: 'cancel',
      bookingId: ID,
    });
  });

  it('button field itself JSON-encoded', () => {
    expect(
      parseInboundWhatsApp({
        customerNumber: '919876543210',
        button: JSON.stringify({ payload: `reschedule:${ID}`, text: 'Reschedule' }),
      }),
    ).toEqual({ from: '919876543210', action: 'reschedule', bookingId: ID });
  });

  it('interactive button_reply', () => {
    expect(
      parseInboundWhatsApp({
        messages: [
          {
            from: '919876543210',
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button_reply: { id: `confirm:${ID}`, title: 'Confirm' },
            },
          },
        ],
      }),
    ).toEqual({ from: '919876543210', action: 'confirm', bookingId: ID });
  });

  it('raw Meta webhook envelope', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '919876543210' }],
                messages: [
                  {
                    from: '919876543210',
                    type: 'button',
                    button: { payload: `cancel:${ID}`, text: 'Cancel' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundWhatsApp(body)).toEqual({
      from: '919876543210',
      action: 'cancel',
      bookingId: ID,
    });
  });

  it('top-level payload string and whole body as a JSON string', () => {
    expect(
      parseInboundWhatsApp(JSON.stringify({ from: '+91 98765 43210', payload: `confirm:${ID}` })),
    ).toEqual({ from: '+91 98765 43210', action: 'confirm', bookingId: ID });
  });

  it('label-only button reply resolves the action without an id', () => {
    expect(
      parseInboundWhatsApp({
        customerNumber: '919876543210',
        contentType: 'button',
        text: 'Confirm',
      }),
    ).toEqual({ from: '919876543210', action: 'confirm', bookingId: null });
  });

  it('ignores plain typed text, even if it says "cancel"', () => {
    expect(
      parseInboundWhatsApp({ customerNumber: '919876543210', contentType: 'text', text: 'cancel' }),
    ).toBeNull();
  });

  it('ignores status callbacks and garbage', () => {
    expect(parseInboundWhatsApp({ status: 'delivered', uuid: 'x' })).toBeNull();
    expect(parseInboundWhatsApp(null)).toBeNull();
    expect(parseInboundWhatsApp('not json')).toBeNull();
    expect(parseInboundWhatsApp([1, 2, 3])).toBeNull();
  });
});

describe('phone matching (anti-spoofing)', () => {
  it('normalizes Indian formats to the same digits', () => {
    const want = '919876543210';
    for (const raw of ['9876543210', '+91 98765 43210', '09876543210', '0091-98765-43210', want]) {
      expect(normalizePhoneForMatch(raw)).toBe(want);
    }
  });

  it('matches the same number in different formats', () => {
    expect(phonesMatch('919876543210', '+91 98765-43210')).toBe(true);
  });

  it('rejects a different number or a missing phone', () => {
    expect(phonesMatch('919876543211', '9876543210')).toBe(false);
    expect(phonesMatch('919876543210', null)).toBe(false);
    expect(phonesMatch(null, null)).toBe(false);
    expect(phonesMatch('', '')).toBe(false);
  });

  it('does not treat a foreign number as Indian', () => {
    expect(phonesMatch('14155550123', '4155550123')).toBe(false);
  });
});
