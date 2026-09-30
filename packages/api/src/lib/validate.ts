import { FONT_IDS } from '@udyamflow/tokens';
import { z } from 'zod';
import { isValidTimeZone } from './time';

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be 6-digit hex, e.g. #0f766e');

// Fonts are chosen from the curated list in @udyamflow/tokens (each one is
// actually loaded by the web app) and stored by id.
export const fontId = z.enum(FONT_IDS);

export const bookingLayout = z.enum(['sidebar', 'stacked', 'inline']);

export const timeZone = z.string().refine(isValidTimeZone, 'Unknown timezone');

export const currency = z.enum(['USD', 'INR']);

// Service prices can be in any ISO 4217 currency: INR checks out via
// Cashfree, everything else via Stripe.
export const serviceCurrency = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. INR, USD, EUR'));

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Customer dedupe key: keep digits and a leading +, drop formatting. We don't
// guess a country code — "+91 98765 43210" and "+919876543210" match, but
// a bare 10-digit number stays as typed.
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function normalizeEmail(raw: string | undefined | null): string | null {
  const e = raw?.trim().toLowerCase();
  return e ? e : null;
}
