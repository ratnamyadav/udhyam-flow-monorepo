import { z } from 'zod';
import { isValidTimeZone } from './time';

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be 6-digit hex, e.g. #0f766e');

// Font stacks end up in CSS custom properties — allow the characters a
// font-family list needs and nothing that could break out of the value.
export const fontStack = z
  .string()
  .max(200)
  .regex(/^[\w\s"',.-]+$/, 'Invalid font stack');

export const timeZone = z.string().refine(isValidTimeZone, 'Unknown timezone');

export const currency = z.enum(['USD', 'INR']);

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
