import { bearerToken, runReminders, secretsMatch } from '@udyamflow/api/whatsapp';
import { db } from '@udyamflow/db';
import type { NextRequest } from 'next/server';

// Hourly reminder cron, triggered by .github/workflows/reminders.yml (any
// scheduler works) with `Authorization: Bearer ${CRON_SECRET}`; anything else
// gets a 401. Sends WhatsApp (with Confirm / Cancel /
// Reschedule buttons) or SMS for confirmed bookings starting in ~24h.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 503 });
  }
  if (!secretsMatch(bearerToken(req.headers.get('authorization')), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await runReminders(db, {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin,
  });
  return Response.json({ ok: true, ...result });
}
