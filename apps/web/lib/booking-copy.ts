import { PROFESSIONS, type Profession, type ProfessionId } from '@udyamflow/tokens';

// Default booking-page wording per profession. Tenants can override the
// headline and intro in Settings → Branding; blank fields fall back to these.

export type BookingLayout = 'sidebar' | 'stacked' | 'inline';
export const BOOKING_LAYOUTS: BookingLayout[] = ['sidebar', 'stacked', 'inline'];

export function isBookingLayout(value: unknown): value is BookingLayout {
  return BOOKING_LAYOUTS.includes(value as BookingLayout);
}

export const HEADLINE_MAX = 120;
export const INTRO_MAX = 600;

export function professionFor(id: string | null | undefined): Profession {
  return PROFESSIONS[id as ProfessionId] ?? PROFESSIONS.doctor;
}

function withArticle(noun: string) {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

export function defaultHeadline(profession: Profession, resourceName?: string | null): string {
  const base = `Book ${withArticle(profession.slotLabel.toLowerCase())}`;
  const parts = resourceName?.trim().split(/\s+/) ?? [];
  // "Dr. Anika Patel" → keep the title with the name instead of "with Dr.".
  const who = parts[0]?.endsWith('.') ? parts.join(' ') : parts[0];
  return who ? `${base} with ${who}` : base;
}

export function defaultIntro(profession: Profession, resourceTitle?: string | null): string {
  return `${resourceTitle || profession.name}. Pick a slot below — we'll email a confirmation.`;
}
