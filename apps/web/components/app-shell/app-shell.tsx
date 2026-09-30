'use client';

import type { TenantTheme } from '@udyamflow/tokens';
import { createContext, useContext } from 'react';
import { TenantThemeProvider } from '@/components/theme/tenant-theme-provider';
import { type OrgOption, Topbar } from './topbar';

// The active workspace's theme as resolved by the (app) layout — name, slug,
// saved colors. Lets client pages (e.g. Settings → Branding) link to the
// public booking page without another round-trip.
const ActiveThemeContext = createContext<TenantTheme | null>(null);

export function useActiveTheme() {
  return useContext(ActiveThemeContext);
}

export function AppShell({
  theme,
  orgs,
  activeOrgId,
  density,
  user,
  children,
}: {
  theme: TenantTheme;
  orgs: OrgOption[];
  activeOrgId: string | null;
  density?: 'compact' | 'comfortable';
  user: { name: string | null; email: string };
  children: React.ReactNode;
}) {
  return (
    <TenantThemeProvider theme={theme} density={density ?? 'comfortable'}>
      <ActiveThemeContext.Provider value={theme}>
        <div className="min-h-screen bg-bg">
          <Topbar orgs={orgs} activeOrgId={activeOrgId} activeTheme={theme} user={user} />
          <div>{children}</div>
        </div>
      </ActiveThemeContext.Provider>
    </TenantThemeProvider>
  );
}
