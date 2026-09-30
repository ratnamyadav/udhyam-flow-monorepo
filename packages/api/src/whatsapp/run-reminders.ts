import { type Db, schema } from '@udyamflow/db';
import { sendSMS, sendWhatsApp } from '@udyamflow/notifications';
import { and, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { bookingUrlFor } from '../source';
import { buildReminderMessages, formatWhen, needsPayLink, reminderWindow } from './reminders';

// DB orchestration for the hourly reminder cron (apps/web/app/api/cron/
// reminders). Neon's http driver has no transactions, so each booking is
// claimed with a conditional update (`reminder_sent_at IS NULL`) before we
// send — two overlapping runs can both select a row but only one claims it.

export type ReminderSenders = {
  whatsApp: typeof sendWhatsApp;
  sms: typeof sendSMS;
};

export type ReminderRunResult = { scanned: number; sent: number; skipped: number; failed: number };

// Mirrors pickProvider() in router/payment.ts: INR → Cashfree, else Stripe.
function providerConfiguredFor(currency: string): boolean {
  return currency.toUpperCase() === 'INR'
    ? !!process.env.CASHFREE_CLIENT_ID
    : !!process.env.STRIPE_SECRET_KEY;
}

export async function runReminders(
  db: Db,
  opts: { appUrl: string; now?: Date; limit?: number; senders?: ReminderSenders },
): Promise<ReminderRunResult> {
  const now = opts.now ?? new Date();
  const senders = opts.senders ?? { whatsApp: sendWhatsApp, sms: sendSMS };
  const appUrl = opts.appUrl.replace(/\/+$/, '');
  const { from, to } = reminderWindow(now);

  const due = await db
    .select({
      id: schema.booking.id,
      organizationId: schema.booking.organizationId,
      customerName: schema.booking.customerName,
      customerPhone: schema.booking.customerPhone,
      slotStart: schema.booking.slotStart,
      paymentStatus: schema.booking.paymentStatus,
      meetingUrl: schema.booking.meetingUrl,
      enableSms: schema.tenantSettings.enableSms,
      enableWhatsapp: schema.tenantSettings.enableWhatsapp,
      orgSlug: schema.organization.slug,
      orgName: schema.organization.name,
      timezone: schema.location.timezone,
      resourceName: schema.resource.name,
      priceCents: schema.service.priceCents,
      currency: schema.service.currency,
    })
    .from(schema.booking)
    .innerJoin(
      schema.tenantSettings,
      eq(schema.tenantSettings.organizationId, schema.booking.organizationId),
    )
    .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
    .innerJoin(schema.location, eq(schema.location.id, schema.booking.locationId))
    .leftJoin(schema.resource, eq(schema.resource.id, schema.booking.resourceId))
    .leftJoin(schema.service, eq(schema.service.id, schema.booking.serviceId))
    .where(
      and(
        eq(schema.booking.status, 'confirmed'),
        isNull(schema.booking.reminderSentAt),
        gte(schema.booking.slotStart, from),
        lt(schema.booking.slotStart, to),
        isNotNull(schema.booking.customerPhone),
        or(
          eq(schema.tenantSettings.enableWhatsapp, true),
          eq(schema.tenantSettings.enableSms, true),
        ),
      ),
    )
    .orderBy(schema.booking.slotStart)
    .limit(opts.limit ?? 200);

  const result: ReminderRunResult = { scanned: due.length, sent: 0, skipped: 0, failed: 0 };

  for (const b of due) {
    if (!b.customerPhone) {
      result.skipped++;
      continue;
    }
    // Claim first. An empty `returning` means another run got here first.
    const claimed = await db
      .update(schema.booking)
      .set({ reminderSentAt: now })
      .where(and(eq(schema.booking.id, b.id), isNull(schema.booking.reminderSentAt)))
      .returning({ id: schema.booking.id });
    if (claimed.length === 0) {
      result.skipped++;
      continue;
    }

    const payUrl = needsPayLink({
      paymentStatus: b.paymentStatus,
      priceCents: b.priceCents,
      providerConfigured: b.currency ? providerConfiguredFor(b.currency) : false,
    })
      ? `${appUrl}/pay/${b.id}`
      : null;
    const messages = buildReminderMessages({
      bookingId: b.id,
      customerName: b.customerName,
      practitioner: b.resourceName ?? b.orgName,
      when: formatWhen(b.slotStart, b.timezone),
      meetingUrl: b.meetingUrl,
      payUrl,
      rebookUrl: bookingUrlFor(appUrl, b.orgSlug, 'whatsapp'),
    });

    try {
      // WhatsApp when enabled (it carries the reply buttons); SMS is the
      // fallback for tenants who only turned SMS on. Never both.
      if (b.enableWhatsapp) {
        await senders.whatsApp({ to: b.customerPhone, ...messages.whatsapp });
      } else {
        await senders.sms({ to: b.customerPhone, ...messages.sms });
      }
      result.sent++;
    } catch (err) {
      // Release the claim so the next hourly run (still inside the ±1h
      // window) retries. A rare duplicate beats a missed reminder.
      console.error('reminder send failed', b.id, err);
      result.failed++;
      await db
        .update(schema.booking)
        .set({ reminderSentAt: null })
        .where(eq(schema.booking.id, b.id))
        .catch((e: unknown) => console.error('reminder claim release failed', b.id, e));
    }
  }

  return result;
}
