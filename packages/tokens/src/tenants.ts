// Per-tenant theme presets used by the design canvas demos. These mirror the seed data
// but each tenant in production will have its own row in `tenant_settings`.

import type { ProfessionId } from './professions';

export type TenantId = 'patel' | 'kavya' | 'baseline';

// Runtime tenant theme. Used by both the seeded demo tenants (where `id` is
// a TenantId) and by real DB-backed orgs (where `id` is the org id from the
// `organization` table). The shape matches what TenantThemeProvider needs.
export type TenantTheme = {
  id: string;
  name: string;
  profession: ProfessionId;
  logo: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  fontUI: string;
  fontDisplay: string;
  radius: number;
  location: string;
  slug: string;
};

export const TENANT_THEMES: Record<TenantId, TenantTheme> = {
  patel: {
    id: 'patel',
    name: "Dr. Patel's Family Clinic",
    slug: 'patel-clinic',
    profession: 'doctor',
    logo: 'PC',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    accentInk: '#134e4a',
    fontUI: '"Inter", system-ui, sans-serif',
    fontDisplay: '"Inter", system-ui, sans-serif',
    radius: 8,
    location: 'Bandra Clinic',
  },
  kavya: {
    id: 'kavya',
    name: "Kavya's Math Studio",
    slug: 'kavyas-math-studio',
    profession: 'teacher',
    logo: 'KM',
    accent: '#7c3aed',
    accentSoft: '#ede9fe',
    accentInk: '#4c1d95',
    fontUI: '"Inter", system-ui, sans-serif',
    fontDisplay: '"Fraunces", Georgia, serif',
    radius: 12,
    location: 'Online',
  },
  baseline: {
    id: 'baseline',
    name: 'Baseline Sports Club',
    slug: 'baseline-sports',
    profession: 'sports',
    logo: 'BS',
    accent: '#ea580c',
    accentSoft: '#ffedd5',
    accentInk: '#7c2d12',
    fontUI: '"Inter", system-ui, sans-serif',
    fontDisplay: '"Inter", system-ui, sans-serif',
    radius: 6,
    location: 'Indiranagar Courts',
  },
} as const;

export const TENANT_LIST: TenantTheme[] = Object.values(TENANT_THEMES);
