import { type Db, schema } from '@udyamflow/db';
import { sendWhatsAppText } from '@udyamflow/notifications';
import { and, eq, gt, gte } from 'drizzle-orm';
import { notifyCancelled } from '../router/booking';
import { bookingUrlFor } from '../source';
import { type InboundReply, parseInboundWhatsApp, phonesMatch } from './inbound';
import { formatWhen } from './reminders';

// Acts on a customer's reply to the reminder. Every path is best-effort and
// the route always answers 200 — MSG91 retries non-2xx, and there's nothing a
// retry could fix for a reply we chose to ignore.

export type InboundOutcome =
  | 'ignored'
  | 'not_found'
  | 'phone_mismatch'
  | 'confirmed'
  | 'cancelled'
  | 'not_cancellable'
  | 'reschedule_sent';

type BookingRow = {
  id: string;
  organizationId: string;
  customerName: string;
  customerPhone: string | null;
  status: string;
  slotStart: Date;
  orgSlug: string;
  orgName: string;
  timezone: string;
};

const bookingColumns = {
  id: schema.booking.id,
  organizationId: schema.booking.organizationId,
  customerName: schema.booking.customerName,
  customerPhone: schema.booking.customerPhone,
  status: schema.booking.status,
  slotStart: schema.booking.slotStart,
  orgSlug: schema.organization.slug,
  orgName: schema.organization.name,
  timezone: schema.location.timezone,
};

// Label-only replies (no payload) are resolved to the sender's soonest
// upcoming booking that got a reminder recently.
const RECENT_REMINDER_MS = 26 * 60 * 60 * 1000;

async function findBooking(db: Db, reply: InboundReply, now: Date): Promise<BookingRow | null> {
  const base = db
    .select(bookingColumns)
    .from(schema.booking)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
    .innerJoin(schema.location, eq(schema.location.id, schema.booking.locationId));

  if (reply.bookingId) {
    const [row] = await base.where(eq(schema.booking.id, reply.bookingId));
    return row ?? null;
  }
  const recent = await base
    .where(
      and(
        eq(schema.booking.status, 'confirmed'),
        gt(schema.booking.slotStart, now),
        gte(schema.booking.reminderSentAt, new Date(now.getTime() - RECENT_REMINDER_MS)),
      ),
    )
    .orderBy(schema.booking.slotStart)
    .limit(500);
  return recent.find((r) => phonesMatch(reply.from, r.customerPhone)) ?? null;
}

export async function handleInboundWhatsApp(
  db: Db,
  body: unknown,
  opts: { appUrl: string; now?: Date; sendText?: typeof sendWhatsAppText },
): Promise<{ outcome: InboundOutcome; bookingId?: string }> {
  const now = opts.now ?? new Date();
  const sendText = opts.sendText ?? sendWhatsAppText;
  const reply = parseInboundWhatsApp(body);
  if (!reply?.from) return { outcome: 'ignored' };

  const booking = await findBooking(db, reply, now);
  if (!booking) return { outcome: 'not_found' };
  if (!phonesMatch(reply.from, booking.customerPhone)) {
    console.warn('whatsapp inbound: sender does not match booking phone', booking.id);
    return { outcome: 'phone_mismatch', bookingId: booking.id };
  }

  const first = booking.customerName.split(' ')[0] || booking.customerName;
  const when = formatWhen(booking.slotStart, booking.timezone);
  // Replies go out as free-form session text — allowed because the customer
  // messaged us moments ago (Meta's 24h customer-service window).
  const reply_ = (text: string) =>
    sendText({ to: reply.from!, text }).catch((err: unknown) =>
      console.error('whatsapp inbound: reply failed', booking.id, err),
    );

  if (reply.action === 'confirm') {
    if (booking.status !== 'confirmed') return { outcome: 'ignored', bookingId: booking.id };
    await db
      .update(schema.booking)
      .set({ customerConfirmedAt: now })
      .where(eq(schema.booking.id, booking.id));
    await reply_(`Thanks ${first}, you're confirmed for ${when}. See you then!`);
    return { outcome: 'confirmed', bookingId: booking.id };
  }

  if (reply.action === 'cancel') {
    // Conditional update doubles as the "still confirmed and in the future"
    // check, and makes a repeated tap a no-op.
    const cancelled = await db
      .update(schema.booking)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(schema.booking.id, booking.id),
          eq(schema.booking.status, 'confirmed'),
          gt(schema.booking.slotStart, now),
        ),
      )
      .returning({ id: schema.booking.id });
    if (cancelled.length === 0) {
      await reply_(
        `Sorry ${first}, this appointment can't be cancelled here any more. Please contact ${booking.orgName} directly.`,
      );
      return { outcome: 'not_cancellable', bookingId: booking.id };
    }
    // Same notice the tenant-side cancel sends.
    await notifyCancelled(db, booking.organizationId, booking.id);
    return { outcome: 'cancelled', bookingId: booking.id };
  }

  const link = bookingUrlFor(opts.appUrl, booking.orgSlug, 'whatsapp');
  await reply_(
    `Hi ${first}, pick a new time with ${booking.orgName} here: ${link} — then tap Cancel on this reminder to free your ${when} slot.`,
  );
  return { outcome: 'reschedule_sent', bookingId: booking.id };
}
