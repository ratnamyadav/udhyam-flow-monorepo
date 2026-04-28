import { db, schema } from '@udyamflow/db';
import { inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { listMyOrganizations, requireSession } from '@/lib/auth-server';
import { settingsToTheme } from '@/lib/theme';

// Server-side authed shell. Resolves the active org + tenantSettings for theming
// and the full org list (with accent colors) for the workspace switcher in one
// pass. Sends users without any org to onboarding.
export default async function AuthedAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const orgs = await listMyOrganizations();

  if (orgs.length === 0) redirect('/onboarding/account');

  const activeOrgId = session.session.activeOrganizationId ?? orgs[0]?.id ?? null;

  // One-shot fetch of every tenantSetting we need for the active org and the switcher.
  const orgIds = orgs.map((o) => o.id);
  const allSettings = await db
    .select()
    .from(schema.tenantSettings)
    .where(inArray(schema.tenantSettings.organizationId, orgIds));
  const settingsByOrgId = new Map(allSettings.map((s) => [s.organizationId, s]));

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0]!;
  const activeSettings = settingsByOrgId.get(activeOrg.id) ?? null;

  const theme = settingsToTheme({
    org: {
      id: activeOrg.id,
      name: activeOrg.name,
      slug: activeOrg.slug,
      logo: activeOrg.logo ?? null,
    },
    settings: activeSettings,
  });

  const orgsForSwitcher = orgs.map((o) => {
    const s = settingsByOrgId.get(o.id);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      logo: s?.logoText ?? o.logo ?? o.name.slice(0, 2).toUpperCase(),
      accent: s?.accent ?? '#1a1815',
    };
  });

  return (
    <AppShell
      theme={theme}
      orgs={orgsForSwitcher}
      activeOrgId={activeOrg.id}
      density={(activeSettings?.density as 'compact' | 'comfortable' | undefined) ?? 'comfortable'}
      user={{ name: session.user.name ?? null, email: session.user.email }}
    >
      {children}
    </AppShell>
  );
}

// Avoid statically rendering the authed shell — every request needs a session.
export const dynamic = 'force-dynamic';
