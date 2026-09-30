import { db, schema } from '@udyamflow/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingInterface } from '@/components/booking/booking-interface';
import { type BookingLayout, isBookingLayout } from '@/lib/booking-copy';
import { settingsToTheme } from '@/lib/theme';

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

  // Resolve org + tenantSettings + active locations, resources and services.
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, orgSlug));
  if (!org) notFound();

  const [settings] = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, org.id));

  // Archived (soft-deleted) rows never show up on the public page.
  const locations = await db
    .select()
    .from(schema.location)
    .where(and(eq(schema.location.organizationId, org.id), isNull(schema.location.archivedAt)))
    .orderBy(schema.location.createdAt);
  const locationIds = new Set(locations.map((l) => l.id));

  const resources = (
    await db
      .select()
      .from(schema.resource)
      .where(and(eq(schema.resource.organizationId, org.id), isNull(schema.resource.archivedAt)))
      .orderBy(schema.resource.createdAt)
  ).filter((r) => locationIds.has(r.locationId));

  const services = await db
    .select()
    .from(schema.service)
    .where(and(eq(schema.service.organizationId, org.id), isNull(schema.service.archivedAt)))
    .orderBy(schema.service.createdAt);

  // Which resources offer each service. Empty = offered by every resource.
  const links =
    services.length > 0
      ? await db
          .select()
          .from(schema.serviceResource)
          .where(
            inArray(
              schema.serviceResource.serviceId,
              services.map((s) => s.id),
            ),
          )
      : [];

  const theme = settingsToTheme({
    org: { id: org.id, name: org.name, slug: org.slug, logo: org.logo },
    settings: settings ?? null,
  });

  // ?layout= previews another layout; otherwise the tenant's saved default.
  const layout: BookingLayout = isBookingLayout(layoutParam)
    ? layoutParam
    : isBookingLayout(settings?.bookingLayout)
      ? settings?.bookingLayout
      : 'sidebar';

  return (
    <BookingInterface
      orgSlug={orgSlug}
      theme={theme}
      locations={locations.map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        timezone: l.timezone,
      }))}
      resources={resources.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        avatar: r.avatar,
        locationId: r.locationId,
      }))}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
        currency: s.currency,
        resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId),
      }))}
      layout={layout}
      density={settings?.density === 'compact' ? 'compact' : 'comfortable'}
      headline={settings?.bookingHeadline ?? null}
      intro={settings?.bookingIntro ?? null}
    />
  );
}
