import type { WhatsAppButton } from '@udyamflow/notifications';

// Pure pieces of the 24h reminder: which bookings are due, and what we send.
// Kept free of DB/env access so they're unit-testable; run-reminders.ts does
// the querying and sending.
//
// WhatsApp templates (must be approved on the MSG91 number, category UTILITY):
//   booking_reminder      body {{1}} first name, {{2}} practitioner,
//                         {{3}} date/time, {{4}} detail line (join link or ref)
//                         buttons: quick replies Confirm / Cancel / Reschedule
//   booking_reminder_pay  same body + buttons, plus a 4th URL button
//                         "Pay now" → https://<app>/pay/{{1}} (suffix = booking id)
// Two templates because a template's buttons are fixed at approval — we can't
// omit the URL button for bookings that are free or already paid.

export const REMINDER_TEMPLATE = 'booking_reminder';
export const REMINDER_PAY_TEMPLATE = 'booking_reminder_pay';

export const REMINDER_LEAD_HOURS = 24;
// ±1h around the 24h mark. With an hourly cron each booking falls inside two
// consecutive runs, so one late/failed run never loses a reminder, and the
// reminderSentAt claim stops the second run from sending it again.
export const REMINDER_SLACK_HOURS = 1;

const HOUR_MS = 60 * 60 * 1000;

export function reminderWindow(
  now: Date,
  leadHours = REMINDER_LEAD_HOURS,
  slackHours = REMINDER_SLACK_HOURS,
): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() + (leadHours - slackHours) * HOUR_MS),
    to: new Date(now.getTime() + (leadHours + slackHours) * HOUR_MS),
  };
}

export function isInReminderWindow(slotStart: Date, now: Date): boolean {
  const { from, to } = reminderWindow(now);
  return slotStart >= from && slotStart < to;
}

export type ReplyAction = 'confirm' | 'cancel' | 'reschedule';
export const REPLY_ACTIONS: readonly ReplyAction[] = ['confirm', 'cancel', 'reschedule'];

// Quick-reply payload — echoed back verbatim on the inbound webhook.
export function replyPayload(action: ReplyAction, bookingId: string): string {
  return `${action}:${bookingId}`;
}

// Only unpaid bookings for a priced service get a pay link. `pending` /
// `failed` are excluded on purpose: a Cashfree order id is the booking id, so
// a second checkout for the same booking would be rejected by the gateway.
export function needsPayLink(args: {
  paymentStatus: string;
  priceCents: number | null | undefined;
  providerConfigured: boolean;
}): boolean {
  return args.paymentStatus === 'unpaid' && (args.priceCents ?? 0) > 0 && args.providerConfigured;
}

export function formatWhen(date: Date, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  try {
    return date.toLocaleString('en-IN', { ...opts, timeZone });
  } catch {
    // Bad tz string on the location — fall back to UTC rather than skipping.
    return date.toLocaleString('en-IN', { ...opts, timeZone: 'UTC' });
  }
}

export type ReminderInput = {
  bookingId: string;
  customerName: string;
  practitioner: string;
  when: string;
  meetingUrl: string | null;
  payUrl: string | null;
  rebookUrl: string;
};

export type ReminderMessages = {
  whatsapp: { template: string; params: string[]; buttons: WhatsAppButton[] };
  sms: { body: string; variables: Record<string, string> };
};

export function buildReminderMessages(input: ReminderInput): ReminderMessages {
  const first = input.customerName.split(' ')[0] || input.customerName;
  const ref = input.bookingId.slice(-6).toUpperCase();
  // Meta rejects template params with newlines and empty params, so the
  // detail slot is always a single non-empty line.
  const detail = input.meetingUrl ? `Join online: ${input.meetingUrl}` : `Ref: ${ref}`;

  const buttons: WhatsAppButton[] = REPLY_ACTIONS.map((a) => ({
    type: 'quick_reply' as const,
    payload: replyPayload(a, input.bookingId),
  }));
  if (input.payUrl) buttons.push({ type: 'url', suffix: input.bookingId });

  const smsParts = [
    `Hi ${first}, reminder: your appointment with ${input.practitioner} is on ${input.when}.`,
    input.meetingUrl ? `Join: ${input.meetingUrl}` : `Ref: ${ref}.`,
    input.payUrl ? `Pay: ${input.payUrl}` : null,
    `Need to change it? ${input.rebookUrl}`,
  ].filter(Boolean);

  return {
    whatsapp: {
      template: input.payUrl ? REMINDER_PAY_TEMPLATE : REMINDER_TEMPLATE,
      params: [first, input.practitioner, input.when, detail],
      buttons,
    },
    sms: {
      body: smsParts.join(' '),
      variables: {
        name: first,
        resource: input.practitioner,
        when: input.when,
        ref,
        link: input.meetingUrl ?? input.payUrl ?? '',
        book: input.rebookUrl,
      },
    },
  };
}
