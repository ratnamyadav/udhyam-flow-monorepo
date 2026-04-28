'use client';

import type { TenantTheme } from '@udyamflow/tokens';
import { tenantThemeToCssVars } from '@udyamflow/tokens';
import { useEffect } from 'react';

// Sets tenant CSS vars on <html> so every component reads var(--accent), etc.
// Used inside the authed layout and on the public booking page.
export function TenantThemeProvider({
  theme,
  density = 'comfortable',
  children,
}: {
  theme: TenantTheme;
  density?: 'compact' | 'comfortable';
  children: React.ReactNode;
}) {
  useEffect(() => {
    const vars = tenantThemeToCssVars(theme);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.density = density;
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [theme, density]);

  return <>{children}</>;
}
