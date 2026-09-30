import { handleInboundWhatsApp, secretsMatch } from '@udyamflow/api/whatsapp';
import { db } from '@udyamflow/db';
import { after, type NextRequest } from 'next/server';

// MSG91 inbound WhatsApp webhook — customer taps Confirm / Cancel /
// Reschedule on the 24h reminder. MSG91 has no documented signing scheme and
// its webhook config is just a URL, so we authenticate with a shared secret
// (MSG91_WEBHOOK_SECRET) passed as `?secret=` or an `x-webhook-secret`
// header. Configure in MSG91 as:
//   POST {APP_URL}/api/notifications/whatsapp/inbound?secret=<MSG91_WEBHOOK_SECRET>
//
// We answer 200 as soon as the secret checks out and do the work in
// `after()`, so slow DB/MSG91 calls never make MSG91 retry.

export async function POST(req: NextRequest) {
  const secret = process.env.MSG91_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('MSG91_WEBHOOK_SECRET not configured', { status: 503 });
  }
  const provided =
    req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret') ?? null;
  if (!secretsMatch(provided, secret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const raw = await req.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    // Some MSG91 setups post form-encoded bodies — fall back to that.
    const form = new URLSearchParams(raw);
    if ([...form.keys()].length > 0) body = Object.fromEntries(form);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  after(async () => {
    try {
      const { outcome, bookingId } = await handleInboundWhatsApp(db, body, { appUrl });
      if (outcome !== 'ignored') console.info('whatsapp inbound', outcome, bookingId ?? '');
    } catch (err) {
      console.error('whatsapp inbound handler failed', err);
    }
  });

  return Response.json({ received: true });
}
