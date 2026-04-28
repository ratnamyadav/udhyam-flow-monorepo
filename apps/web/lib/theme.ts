import { TENANT_THEMES, type TenantTheme } from '@udyamflow/tokens';

// Shape returned by `tenant.getSettings` (see packages/db/src/schema/tenant.ts).
type SettingsRow = {
  organizationId: string;
  profession: string;
  templateId: string;
  logoText: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  fontDisplay: string;
  fontUi: string;
  radius: number;
  density: string;
  currency: string;
};

// Builds a TenantTheme (used by TenantThemeProvider) from DB rows. Falls back
// to the Patel demo theme if settings are missing — keeps unauthed/demo paths
// rendering correctly.
export function settingsToTheme(args: {
  org: { id: string; name: string; slug: string; logo: string | null } | null;
  settings: SettingsRow | null;
}): TenantTheme {
  const { org, settings } = args;
  if (!org || !settings) return TENANT_THEMES.patel;

  return {
    id: org.id as TenantTheme['id'],
    slug: org.slug,
    name: org.name,
    profession: settings.profession as TenantTheme['profession'],
    logo: settings.logoText,
    accent: settings.accent,
    accentSoft: settings.accentSoft,
    accentInk: settings.accentInk,
    fontDisplay: settings.fontDisplay,
    fontUI: settings.fontUi,
    radius: settings.radius,
    location: '',
  };
}
