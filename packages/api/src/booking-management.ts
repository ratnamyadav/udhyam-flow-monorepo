import { createHmac, timingSafeEqual } from 'node:crypto';

// Purpose-bound capability delivered only to the customer. Status/checkout
// URLs and short reference codes never authorize changing an appointment.
export function bookingManagementToken(bookingId: string, slotStart: Date): string | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  const expires = Math.floor((slotStart.getTime() + 24 * 60 * 60_000) / 1000);
  const signature = createHmac('sha256', secret)
    .update(`booking-management:v1:${bookingId}:${expires}`)
    .digest('base64url');
  return `${expires}.${signature}`;
}

export function verifyBookingManagementToken(
  bookingId: string,
  token: string,
  now = Date.now(),
): boolean {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || Number(match[1]) * 1000 <= now) return false;
  const expected = createHmac('sha256', secret)
    .update(`booking-management:v1:${bookingId}:${match[1]}`)
    .digest();
  const actual = Buffer.from(match[2]!, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function bookingManagementUrl(bookingId: string, slotStart: Date): string | null {
  const token = bookingManagementToken(bookingId, slotStart);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/+$/, '')}/manage-booking?booking=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
}
