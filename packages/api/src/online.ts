import { randomBytes } from 'node:crypto';
import { z } from 'zod';

// Online sessions. A service flagged `isOnline` gets a join link on every
// booking: the practitioner's own Meet/Zoom room when they've set one on
// their resource, else a fresh Jitsi room (no account needed on either side).
// Links end up in customer SMS/WhatsApp/email, so we only ever store https.

const MAX_URL_LENGTH = 500;
const JITSI_BASE = 'https://meet.jit.si';
const ROOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function isValidMeetingUrl(raw: string): boolean {
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // No embedded credentials — they'd be sent to every customer.
  return url.protocol === 'https:' && url.hostname.length > 0 && !url.username && !url.password;
}

// Tenant-side input: '' or null clears the link, anything else must be https.
export const meetingUrlInput = z
  .string()
  .trim()
  .max(MAX_URL_LENGTH)
  .refine((v) => v === '' || isValidMeetingUrl(v), {
    message: 'Meeting link must be a full https:// URL',
  })
  .transform((v) => (v === '' ? null : v))
  .nullable();

// Unguessable, URL-safe room name — lowercase alphanumerics only so it
// survives SMS templates and is easy to read out over the phone. The modulo
// bias (256 % 36) is irrelevant here: 16 chars is still ~80 bits.
export function generateJitsiUrl(length = 16): string {
  const bytes = randomBytes(length);
  let id = '';
  for (const b of bytes) id += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  return `${JITSI_BASE}/udyamflow-${id}`;
}

export function resolveMeetingUrl(args: {
  serviceIsOnline: boolean;
  resourceMeetingUrl: string | null | undefined;
}): string | null {
  if (!args.serviceIsOnline) return null;
  const own = args.resourceMeetingUrl?.trim();
  if (own && isValidMeetingUrl(own)) return own;
  return generateJitsiUrl();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Confirmation email for online bookings — the join link is the one thing
// the customer needs on the day, so it goes by email too when we have an
// address (there's no generic confirmation email yet).
export function buildOnlineSessionEmail(args: {
  customerName: string;
  resourceName: string;
  when: string;
  referenceCode: string;
  meetingUrl: string;
}): { subject: string; html: string } {
  const first = args.customerName.split(' ')[0] || args.customerName;
  const url = escapeHtml(args.meetingUrl);
  return {
    subject: `Your online session on ${args.when}`,
    html: [
      `<p>Hi ${escapeHtml(first)},</p>`,
      `<p>Your online session with ${escapeHtml(args.resourceName || 'us')} on <strong>${escapeHtml(args.when)}</strong> is confirmed.</p>`,
      `<p>Join here: <a href="${url}">${url}</a></p>`,
      `<p>Reference: ${escapeHtml(args.referenceCode)}</p>`,
    ].join('\n'),
  };
}
