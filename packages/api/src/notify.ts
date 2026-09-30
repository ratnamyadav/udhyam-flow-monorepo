import { type Db, schema } from '@udyamflow/db';
import { isMsg91Configured, sendEmail, sendSMS, sendWhatsApp } from '@udyamflow/notifications';
import { eq } from 'drizzle-orm';
import { formatInTz } from './lib/time';
import { escapeHtml } from './lib/validate';

// Customer-facing booking notifications. Every function swallows its own
// errors: a failed SMS must never roll back or fail a booking write. Callers
// await them (rather than fire-and-forget) because serverless runtimes may
// freeze the instance as soon as the response is sent.

export function referenceCodeFor(bookingId: string): string {
  return bookingId.slice(-6).toUpperCase();
}

async function loadBookingForNotice(db: Db, bookingId: string) {
  const [row] = await db
    .select({
      booking: schema.booking,
      resourceName: schema.resource.name,
      timezone: schema.location.timezone,
      locationName: schema.location.name,
      orgName: schema.organization.name,
      enableSms: schema.tenantSettings.enableSms,
      enableWhatsapp: schema.tenantSettings.enableWhatsapp,
    })
    .from(schema.booking)
    .innerJoin(schema.resource, eq(schema.resource.id, schema.booking.resourceId))
    .innerJoin(schema.location, eq(schema.location.id, schema.booking.locationId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.booking.organizationId))
    .leftJoin(
      schema.tenantSettings,
      eq(schema.tenantSettings.organizationId, schema.booking.organizationId),
    )
    .where(eq(schema.booking.id, bookingId));
  return row ?? null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function emailShell(title: string, body: string): string {
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;">
      <h2 style="margin:0 0 12px 0;font-weight:500;color:#1a1815;">${title}</h2>
      ${body}
    </div>
  `.trim();
}

export async function notifyConfirmed(db: Db, bookingId: string): Promise<void> {
  try {
    const row = await loadBookingForNotice(db, bookingId);
    if (!row) return;
    const b = row.booking;
    const when = formatInTz(b.slotStart, row.timezone, 'd MMM yyyy, HH:mm');
    const ref = referenceCodeFor(b.id);
    const name = firstName(b.customerName);
    // Online sessions: the join link is the one thing the customer needs on
    // the day, so it goes into every channel.
    const link = b.meetingUrl;

    if (b.customerEmail) {
      await sendEmail({
        to: b.customerEmail,
        subject: link
          ? `Your online session on ${when} — ${row.orgName}`
          : `Booking confirmed — ${row.orgName}`,
        html: emailShell(
          'Your booking is confirmed',
          `<p style="color:#5e5b54;line-height:1.6;">
            Hi ${escapeHtml(name)}, your appointment with <strong>${escapeHtml(row.resourceName)}</strong>
            at ${escapeHtml(row.orgName)} (${escapeHtml(row.locationName)}) is confirmed for
            <strong>${escapeHtml(when)}</strong> (${escapeHtml(row.timezone)}).
          </p>
          ${
            link
              ? `<p style="color:#5e5b54;line-height:1.6;">Join here: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
              : ''
          }
          <p style="color:#9a978f;font-size:12px;">Reference: ${ref}</p>`,
        ),
      }).catch((err) => console.error('confirmation email failed', err));
    }

    if (b.customerPhone && row.enableSms) {
      await sendSMS({
        to: b.customerPhone,
        body: `Hi ${name}, your appointment with ${row.resourceName} on ${when} is confirmed. Ref: ${ref}${link ? ` Join: ${link}` : ''}`,
        variables: { name, resource: row.resourceName, when, ref, ...(link ? { link } : {}) },
      }).catch((err) => console.error('confirmation SMS failed', err));
    }
    if (b.customerPhone && row.enableWhatsapp) {
      // Online bookings use `booking_confirmed_online`: same four body
      // params as `booking_confirmed` plus {{5}} = join link.
      await sendWhatsApp({
        to: b.customerPhone,
        template: link ? 'booking_confirmed_online' : 'booking_confirmed',
        params: [name, row.resourceName, when, ref, ...(link ? [link] : [])],
      }).catch((err) => console.error('confirmation WhatsApp failed', err));
    }
  } catch (err) {
    console.error('notifyConfirmed failed', err);
  }
}

export async function notifyCancelled(db: Db, bookingId: string): Promise<void> {
  try {
    const row = await loadBookingForNotice(db, bookingId);
    if (!row) return;
    const b = row.booking;
    const when = formatInTz(b.slotStart, row.timezone, 'd MMM yyyy, HH:mm');
    const ref = referenceCodeFor(b.id);
    const name = firstName(b.customerName);

    if (b.customerEmail) {
      await sendEmail({
        to: b.customerEmail,
        subject: `Booking cancelled — ${row.orgName}`,
        html: emailShell(
          'Your booking was cancelled',
          `<p style="color:#5e5b54;line-height:1.6;">
            Hi ${escapeHtml(name)}, your appointment with ${escapeHtml(row.resourceName)} on
            <strong>${escapeHtml(when)}</strong> has been cancelled. Please rebook if needed.
          </p>
          <p style="color:#9a978f;font-size:12px;">Reference: ${ref}</p>`,
        ),
      }).catch((err) => console.error('cancellation email failed', err));
    }

    if (b.customerPhone && row.enableSms) {
      // MSG91 sends the DLT template, not `body`. Without a dedicated
      // cancellation template we'd send the "confirmed" text — skip instead.
      const templateId = process.env.MSG91_SMS_CANCEL_TEMPLATE_ID;
      if (isMsg91Configured() && !templateId) {
        console.warn('Skipping cancellation SMS: MSG91_SMS_CANCEL_TEMPLATE_ID is not set');
      } else {
        await sendSMS({
          to: b.customerPhone,
          body: `Hi ${name}, your appointment on ${when} has been cancelled. Please rebook if needed. Ref: ${ref}`,
          variables: { name, resource: row.resourceName, when, ref },
          templateId,
        }).catch((err) => console.error('cancellation SMS failed', err));
      }
    }
    if (b.customerPhone && row.enableWhatsapp) {
      await sendWhatsApp({
        to: b.customerPhone,
        template: 'booking_cancelled',
        params: [name, when],
      }).catch((err) => console.error('cancellation WhatsApp failed', err));
    }
  } catch (err) {
    console.error('notifyCancelled failed', err);
  }
}
