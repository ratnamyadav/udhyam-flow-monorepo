import { db, schema } from '@udyamflow/db';
import { tenantThemeStyle } from '@udyamflow/tokens';
import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingInterface } from '@/components/booking/booking-interface';
import { settingsToTheme } from '@/lib/theme';

type Layout = 'sidebar' | 'stacked' | 'inline';
const LAYOUTS = ['sidebar', 'stacked', 'inline'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.slug, orgSlug));
  if (!org) return { title: 'Book — UdyamFlow' };
  return {
    title: `Book with ${org.name} — UdyamFlow`,
    description: `Reserve a slot with ${org.name}. Powered by UdyamFlow.`,
    openGraph: { title: `Book with ${org.name}`, siteName: 'UdyamFlow', type: 'website' },
    // Tenant booking pages aren't for general SEO indexing.
    robots: { index: false },
  };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ layout?: string }>;
}) {
  const { orgSlug } = await params;
  const { layout: layoutParam } = await searchParams;

  // Resolve org + tenantSettings + first location + resources in one shot.
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, orgSlug));
  if (!org) notFound();

  const [settings] = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, org.id));

  const locations = await db
    .select()
    .from(schema.location)
    .where(eq(schema.location.organizationId, org.id));
  const firstLocation = locations[0];

  const resources = await db
    .select()
    .from(schema.resource)
    .where(eq(schema.resource.organizationId, org.id));

  const services = await db
    .select()
    .from(schema.service)
    .where(eq(schema.service.organizationId, org.id));

  const theme = settingsToTheme({
    org: { id: org.id, name: org.name, slug: org.slug, logo: org.logo },
    settings: settings ?? null,
  });

  // Only advertise memberships when there's something to buy.
  const [membershipPlan] = await db
    .select({ id: schema.membershipPlan.id })
    .from(schema.membershipPlan)
    .where(
      and(eq(schema.membershipPlan.organizationId, org.id), eq(schema.membershipPlan.active, true)),
    )
    .limit(1);

  const layout: Layout = LAYOUTS.includes(layoutParam as Layout)
    ? (layoutParam as Layout)
    : 'sidebar';

  const page = (
    <BookingInterface
      orgSlug={orgSlug}
      theme={theme}
      locationId={firstLocation?.id ?? null}
      timezone={firstLocation?.timezone ?? 'UTC'}
      resources={resources.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        avatar: r.avatar,
      }))}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
        currency: s.currency,
      }))}
      layout={layout}
    />
  );
  if (!membershipPlan) return page;
  return (
    <>
      {page}
      <div className="bg-bg pb-10 text-center" style={tenantThemeStyle(theme)}>
        <a
          href={`/book/${orgSlug}/memberships`}
          className="text-[12px] text-ink-mute hover:text-ink underline-offset-2 hover:underline"
        >
          Memberships →
        </a>
      </div>
    </>
  );
}
