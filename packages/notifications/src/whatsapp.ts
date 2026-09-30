// MSG91 WhatsApp sender. Uses MSG91's WhatsApp Business API. Falls back to
// console.log when MSG91_AUTH_KEY + MSG91_WHATSAPP_INTEGRATED_NUMBER unset.
//
// Payload shape — an assumption we couldn't verify against a live account:
// the original sender put Meta Cloud-API style `components` (an array) on
// `template`. MSG91's bulk docs (and the @qubitcodes/msg91 SDK) instead put
// a keyed map (`body_1`, `button_1`, …) under `to_and_components[].components`.
// We send both, describing the same values, so whichever one MSG91 reads is
// complete. The legacy array is byte-identical to before for body-only calls.

type FetchLike = typeof fetch;

// Buttons are listed in the same order as they're defined in the approved
// template — the array position is the button index Meta/MSG91 match on.
export type WhatsAppButton =
  // Quick reply: the payload comes back verbatim on the inbound webhook when
  // the customer taps it (the button label itself is fixed in the template).
  | { type: 'quick_reply'; payload: string }
  // URL button with a dynamic suffix: the template defines the base URL
  // (e.g. `https://app.udyamflow.com/pay/{{1}}`), we only send the suffix.
  | { type: 'url'; suffix: string };

type SendWhatsAppArgs = {
  to: string;
  // The pre-approved WhatsApp template name (Meta requires templates for
  // outbound business-initiated messages).
  template: string;
  // Variables to inject into the template body.
  params: Array<string | number>;
  // Optional button parameters, in template order.
  buttons?: WhatsAppButton[];
};

type SendOptions = { fetch?: FetchLike };

const BULK_URL = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
const SESSION_URL = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/';

export function normalizeWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// Pure — builds the JSON body for the bulk template endpoint. Exported for
// unit tests so the wire shape is pinned down in one place.
export function buildWhatsAppTemplatePayload(args: {
  integratedNumber: string;
  recipient: string;
  template: string;
  params: Array<string | number>;
  buttons?: WhatsAppButton[];
}) {
  const buttons = args.buttons ?? [];

  const metaComponents: Array<Record<string, unknown>> = [
    {
      type: 'body',
      parameters: args.params.map((p) => ({ type: 'text', text: String(p) })),
    },
  ];
  buttons.forEach((b, index) => {
    metaComponents.push(
      b.type === 'quick_reply'
        ? {
            type: 'button',
            sub_type: 'quick_reply',
            index: String(index),
            parameters: [{ type: 'payload', payload: b.payload }],
          }
        : {
            type: 'button',
            sub_type: 'url',
            index: String(index),
            parameters: [{ type: 'text', text: b.suffix }],
          },
    );
  });

  const recipientEntry: { to: string[]; components?: Record<string, unknown> } = {
    to: [args.recipient],
  };
  // Only emit the keyed map when there's something beyond the legacy body
  // params — keeps body-only calls identical to the original payload.
  if (buttons.length > 0) {
    const keyed: Record<string, unknown> = {};
    args.params.forEach((p, i) => {
      keyed[`body_${i + 1}`] = { type: 'text', value: String(p) };
    });
    buttons.forEach((b, i) => {
      keyed[`button_${i + 1}`] =
        b.type === 'quick_reply'
          ? { subtype: 'quick_reply', type: 'payload', value: b.payload }
          : { subtype: 'url', type: 'text', value: b.suffix };
    });
    recipientEntry.components = keyed;
  }

  return {
    integrated_number: args.integratedNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: args.template,
        language: { code: 'en' },
        components: metaComponents,
        to_and_components: [recipientEntry],
      },
    },
  };
}

export async function sendWhatsApp(
  { to, template, params, buttons }: SendWhatsAppArgs,
  opts: SendOptions = {},
): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;

  if (!authKey || !integratedNumber) {
    console.log('────── whatsapp (no MSG91 config) ──────');
    console.log(`To:       ${to}`);
    console.log(`Template: ${template}`);
    console.log(`Params:`, params);
    if (buttons?.length) console.log('Buttons:', buttons);
    console.log('────────────────────────────────────────');
    return;
  }

  const body = buildWhatsAppTemplatePayload({
    integratedNumber,
    recipient: normalizeWhatsAppNumber(to),
    template,
    params,
    buttons,
  });
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(BULK_URL, {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MSG91 WhatsApp failed (${res.status}): ${text}`);
  }
}

// Free-form session text. Only deliverable inside Meta's 24h customer-service
// window (i.e. as a reply to something the customer just sent us) — use a
// template for anything business-initiated. Mirrors the SDK's shape: MSG91
// takes session-message fields as query params on the non-bulk endpoint.
export async function sendWhatsAppText(
  { to, text }: { to: string; text: string },
  opts: SendOptions = {},
): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;

  if (!authKey || !integratedNumber) {
    console.log('────── whatsapp text (no MSG91 config) ──────');
    console.log(`To:   ${to}`);
    console.log(`Text: ${text}`);
    console.log('─────────────────────────────────────────────');
    return;
  }

  const url = new URL(SESSION_URL);
  url.searchParams.set('integrated_number', integratedNumber);
  url.searchParams.set('recipient_number', normalizeWhatsAppNumber(to));
  url.searchParams.set('content_type', 'text');
  url.searchParams.set('text', text);
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(url.toString(), {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MSG91 WhatsApp text failed (${res.status}): ${body}`);
  }
}
