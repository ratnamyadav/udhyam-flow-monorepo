'use client';

import type { TenantTheme } from '@udyamflow/tokens';
import { TenantThemeProvider } from '@/components/theme/tenant-theme-provider';
import { type OrgOption, Topbar } from './topbar';

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
      <div className="min-h-screen bg-bg">
        <Topbar orgs={orgs} activeOrgId={activeOrgId} activeTheme={theme} user={user} />
        <div>{children}</div>
      </div>
    </TenantThemeProvider>
  );
}
