// Booking source attribution (`?source=google` on the public booking link).
// The value is attacker-controlled and ends up in reports, so we keep it to
// a short lowercase slug and drop anything else rather than rejecting the
// booking over a bad query string.

const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;

export function sanitizeSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return SOURCE_RE.test(v) ? v : null;
}

// Channels we pre-build share links for on /settings/channels.
export const SHARE_SOURCES = ['google', 'instagram', 'whatsapp'] as const;

export function bookingUrlFor(appUrl: string, orgSlug: string, source?: string): string {
  const base = `${appUrl.replace(/\/+$/, '')}/book/${encodeURIComponent(orgSlug)}`;
  return source ? `${base}?source=${encodeURIComponent(source)}` : base;
}
