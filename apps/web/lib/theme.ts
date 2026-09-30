import { TENANT_THEMES, type TenantTheme } from '@udyamflow/tokens';

// Shape returned by `tenant.getSettings` (see packages/db/src/schema/tenant.ts).
type SettingsRow = {
  organizationId: string;
  profession: string;
  templateId: string;
  logoText: string;
  logoUrl?: string | null;
  accent: string;
  accentSoft: string;
  accentInk: string;
  fontDisplay: string;
  fontUi: string;
  radius: number;
  density: string;
  currency: string;
};

// Builds a TenantTheme (used by TenantThemeProvider) from DB rows. An org
// without a settings row gets neutral defaults under its own name; only a
// missing org (demo/marketing paths) falls back to the Patel demo theme.
export function settingsToTheme(args: {
  org: { id: string; name: string; slug: string; logo: string | null } | null;
  settings: SettingsRow | null;
}): TenantTheme {
  const { org, settings } = args;
  if (!org) return TENANT_THEMES.patel;
  if (!settings) {
    const initials = org.name.slice(0, 2).toUpperCase();
    return {
      ...TENANT_THEMES.patel,
      id: org.id,
      slug: org.slug,
      name: org.name,
      logo: org.logo ?? initials,
      logoUrl: null,
      location: '',
    };
  }

  return {
    id: org.id as TenantTheme['id'],
    slug: org.slug,
    name: org.name,
    profession: settings.profession as TenantTheme['profession'],
    logo: settings.logoText,
    logoUrl: settings.logoUrl ?? null,
    accent: settings.accent,
    accentSoft: settings.accentSoft,
    accentInk: settings.accentInk,
    fontDisplay: settings.fontDisplay,
    fontUI: settings.fontUi,
    radius: settings.radius,
    location: '',
  };
}
