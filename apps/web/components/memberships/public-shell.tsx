import 'server-only';
import { db, schema } from '@udyamflow/db';
import { type TenantTheme, tenantThemeStyle } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { settingsToTheme } from '@/lib/theme';

// Shared bits for the public /book/[orgSlug]/memberships/* pages: resolve
// the tenant + theme the same way the booking page does, and a themed shell.

export async function loadPublicTenant(orgSlug: string) {
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, orgSlug));
  if (!org) return null;
  const [settings] = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, org.id));
  const theme = settingsToTheme({
    org: { id: org.id, name: org.name, slug: org.slug, logo: org.logo },
    settings: settings ?? null,
  });
  return { org, theme };
}

export function PublicShell({
  theme,
  orgSlug,
  refreshUrl,
  children,
}: {
  theme: TenantTheme;
  orgSlug: string;
  // When set, the page re-requests this URL after 5s (webhook race).
  refreshUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg px-4 py-10 sm:p-12 min-h-[100vh]" style={tenantThemeStyle(theme)}>
      {refreshUrl && <meta httpEquiv="refresh" content={`5;url=${refreshUrl}`} />}
      <div className="max-w-[960px] mx-auto">
        <a href={`/book/${orgSlug}`} className="flex items-center gap-2.5 mb-10 w-fit">
          <div
            className="w-10 h-10 grid place-items-center text-white text-sm font-semibold"
            style={{ background: theme.accent, borderRadius: theme.radius }}
          >
            {theme.logo}
          </div>
          <div
            className="text-[15px] font-semibold text-ink"
            style={{ fontFamily: theme.fontDisplay }}
          >
            {theme.name}
          </div>
        </a>
        {children}
      </div>
    </div>
  );
}

export function NoticeCard({
  title,
  body,
  href,
  cta,
  theme,
}: {
  title: string;
  body: React.ReactNode;
  href?: string;
  cta?: string;
  theme: TenantTheme;
}) {
  return (
    <div className="max-w-[460px]">
      <h1
        className="text-[28px] m-0 font-medium tracking-tight text-ink"
        style={{ fontFamily: theme.fontDisplay, lineHeight: 1.15 }}
      >
        {title}
      </h1>
      <div className="text-[14px] text-ink-mute mt-3 leading-relaxed">{body}</div>
      {href && cta && (
        <a
          href={href}
          className="mt-6 inline-block px-5 py-2.5 text-white text-[13px] font-medium"
          style={{ background: 'var(--accent)', borderRadius: theme.radius }}
        >
          {cta}
        </a>
      )}
    </div>
  );
}
