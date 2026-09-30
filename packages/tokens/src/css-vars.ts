// Translates a TenantTheme into CSS custom properties for client-side theming.
// Components read these via `var(--accent)`, `var(--accent-soft)`, etc.
//
// Returns a plain object so this package stays React-free; consumers can spread
// the result into a `style` prop on the web (`style={tenantThemeStyle(theme)}`)
// or hand it to whatever style system they use.

import { readableTextOn } from './color';
import { fontStack } from './fonts';
import type { TenantTheme } from './tenants';

export type CssVars = Record<string, string>;

export function tenantThemeToCssVars(theme: TenantTheme): CssVars {
  return {
    '--accent': theme.accent,
    '--accent-soft': theme.accentSoft,
    '--accent-ink': theme.accentInk,
    // Text/icons on an accent background — white or ink by contrast, so a
    // light accent (yellow, lime) still gets readable buttons.
    '--accent-fg': readableTextOn(theme.accent),
    '--radius': `${theme.radius}px`,
    '--font-display': fontStack(theme.fontDisplay),
    '--font-ui': fontStack(theme.fontUI),
  };
}

export const tenantThemeStyle = tenantThemeToCssVars;
