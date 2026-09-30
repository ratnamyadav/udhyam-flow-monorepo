import {
  buildWhatsAppTemplatePayload,
  sendWhatsApp,
  sendWhatsAppText,
} from '@udyamflow/notifications';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { url: string; init: RequestInit };

function mockFetch(status = 200) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(status === 200 ? '{"status":"success"}' : 'nope', { status });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe('sendWhatsApp', () => {
  beforeEach(() => {
    process.env.MSG91_AUTH_KEY = 'test-key';
    process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER = '918000000000';
  });
  afterEach(() => {
    delete process.env.MSG91_AUTH_KEY;
    delete process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;
  });

  it('keeps the legacy body-only payload unchanged for existing callers', async () => {
    const { fetch, calls } = mockFetch();
    await sendWhatsApp(
      { to: '9876543210', template: 'booking_confirmed', params: ['Asha', 'Dr. P', 'x', 'REF'] },
      { fetch },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
    );
    expect((calls[0]!.init.headers as Record<string, string>).authkey).toBe('test-key');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      integrated_number: '918000000000',
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: 'booking_confirmed',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: ['Asha', 'Dr. P', 'x', 'REF'].map((t) => ({ type: 'text', text: t })),
            },
          ],
          to_and_components: [{ to: ['919876543210'] }],
        },
      },
    });
  });

  it('sends quick-reply payloads and a URL suffix in both component formats', async () => {
    const { fetch, calls } = mockFetch();
    await sendWhatsApp(
      {
        to: '+91 98765 43210',
        template: 'booking_reminder_pay',
        params: ['Asha', 'Dr. P', '2 Oct', 'Ref: ABC'],
        buttons: [
          { type: 'quick_reply', payload: 'confirm:bkg_1' },
          { type: 'quick_reply', payload: 'cancel:bkg_1' },
          { type: 'quick_reply', payload: 'reschedule:bkg_1' },
          { type: 'url', suffix: 'bkg_1' },
        ],
      },
      { fetch },
    );
    const body = JSON.parse(String(calls[0]!.init.body));
    const t = body.payload.template;

    // Meta Cloud-API style array.
    expect(t.components.slice(1)).toEqual([
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '0',
        parameters: [{ type: 'payload', payload: 'confirm:bkg_1' }],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '1',
        parameters: [{ type: 'payload', payload: 'cancel:bkg_1' }],
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '2',
        parameters: [{ type: 'payload', payload: 'reschedule:bkg_1' }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '3',
        parameters: [{ type: 'text', text: 'bkg_1' }],
      },
    ]);

    // MSG91 keyed map per recipient.
    expect(t.to_and_components).toEqual([
      {
        to: ['919876543210'],
        components: {
          body_1: { type: 'text', value: 'Asha' },
          body_2: { type: 'text', value: 'Dr. P' },
          body_3: { type: 'text', value: '2 Oct' },
          body_4: { type: 'text', value: 'Ref: ABC' },
          button_1: { subtype: 'quick_reply', type: 'payload', value: 'confirm:bkg_1' },
          button_2: { subtype: 'quick_reply', type: 'payload', value: 'cancel:bkg_1' },
          button_3: { subtype: 'quick_reply', type: 'payload', value: 'reschedule:bkg_1' },
          button_4: { subtype: 'url', type: 'text', value: 'bkg_1' },
        },
      },
    ]);
  });

  it('throws with the gateway status on failure', async () => {
    const { fetch } = mockFetch(500);
    await expect(
      sendWhatsApp({ to: '9876543210', template: 't', params: [] }, { fetch }),
    ).rejects.toThrow(/500/);
  });

  it('logs instead of calling MSG91 when unconfigured', async () => {
    delete process.env.MSG91_AUTH_KEY;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fetch, calls } = mockFetch();
    await sendWhatsApp({ to: '9876543210', template: 't', params: ['a'] }, { fetch });
    expect(calls).toHaveLength(0);
    log.mockRestore();
  });

  it('sends session text to the non-bulk endpoint', async () => {
    const { fetch, calls } = mockFetch();
    await sendWhatsAppText({ to: '9876543210', text: 'Book here: https://x/y?a=1' }, { fetch });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api/v5/whatsapp/whatsapp-outbound-message/');
    expect(url.searchParams.get('content_type')).toBe('text');
    expect(url.searchParams.get('recipient_number')).toBe('919876543210');
    expect(url.searchParams.get('integrated_number')).toBe('918000000000');
    expect(url.searchParams.get('text')).toBe('Book here: https://x/y?a=1');
  });

  it('pure builder omits the keyed map when there are no buttons', () => {
    const p = buildWhatsAppTemplatePayload({
      integratedNumber: '1',
      recipient: '2',
      template: 't',
      params: ['a'],
    });
    expect(p.payload.template.to_and_components).toEqual([{ to: ['2'] }]);
  });
});
