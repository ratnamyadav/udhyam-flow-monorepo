// MSG91 SMS sender. Uses MSG91's Flow API — the `flow_id` is the template id
// (templates must be DLT-approved in India). Falls back to console.log in dev
// when MSG91_AUTH_KEY is unset.
//
// Phone numbers are normalised to E.164 — anything starting with `+` is left
// alone; pure-digit Indian numbers (10 digits) get a `+91` prefix.

type SendSmsArgs = {
  to: string; // E.164 ('+9198…') preferred
  body: string;
  // Variables that fill the DLT-approved template. Keys must match what's
  // configured in MSG91.
  variables?: Record<string, string | number>;
  // MSG91 Flow template to use. Defaults to MSG91_SMS_TEMPLATE_ID (the
  // booking-confirmation template) — pass another for other message kinds.
  templateId?: string;
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits;
}

export async function sendSMS({ to, body, variables, templateId }: SendSmsArgs): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const flowId = templateId ?? process.env.MSG91_SMS_TEMPLATE_ID;
  const sender = process.env.MSG91_SMS_SENDER;

  if (!authKey || !flowId) {
    console.log('────── sms (no MSG91 config) ──────');
    console.log(`To:   ${to}`);
    console.log(`Body: ${body}`);
    if (variables) console.log('Vars:', variables);
    console.log('───────────────────────────────────');
    return;
  }

  const mobiles = normalizePhone(to).replace(/^\+/, '');
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: flowId,
      sender,
      recipients: [{ mobiles, ...variables }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MSG91 SMS failed (${res.status}): ${text}`);
  }
}
