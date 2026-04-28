// Translates a TenantTheme into CSS custom properties for client-side theming.
// Components read these via `var(--accent)`, `var(--accent-soft)`, etc.
//
// Returns a plain object so this package stays React-free; consumers can spread
// the result into a `style` prop on the web (`style={tenantThemeStyle(theme)}`)
// or hand it to whatever style system they use.

import type { TenantTheme } from './tenants';

export type CssVars = Record<string, string>;

export function tenantThemeToCssVars(theme: TenantTheme): CssVars {
  return {
    '--accent': theme.accent,
    '--accent-soft': theme.accentSoft,
    '--accent-ink': theme.accentInk,
    '--radius': `${theme.radius}px`,
    '--font-display': theme.fontDisplay,
    '--font-ui': theme.fontUI,
  };
}

export const tenantThemeStyle = tenantThemeToCssVars;
