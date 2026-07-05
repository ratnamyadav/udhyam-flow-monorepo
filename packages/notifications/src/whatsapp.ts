// MSG91 WhatsApp sender. Uses MSG91's WhatsApp Business API. Falls back to
// console.log when MSG91_AUTH_KEY + MSG91_WHATSAPP_INTEGRATED_NUMBER unset.

type SendWhatsAppArgs = {
  to: string;
  // The pre-approved WhatsApp template name (Meta requires templates for
  // outbound business-initiated messages).
  template: string;
  // Variables to inject into the template body.
  params: Array<string | number>;
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function sendWhatsApp({ to, template, params }: SendWhatsAppArgs): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;

  if (!authKey || !integratedNumber) {
    console.log('────── whatsapp (no MSG91 config) ──────');
    console.log(`To:       ${to}`);
    console.log(`Template: ${template}`);
    console.log(`Params:`, params);
    console.log('────────────────────────────────────────');
    return;
  }

  const recipient = normalizePhone(to);
  const res = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      integrated_number: integratedNumber,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: template,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: params.map((p) => ({ type: 'text', text: String(p) })),
            },
          ],
          to_and_components: [{ to: [recipient] }],
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MSG91 WhatsApp failed (${res.status}): ${text}`);
  }
}
