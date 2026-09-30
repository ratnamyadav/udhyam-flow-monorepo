import { db, schema } from '@udyamflow/db';
import { tenantThemeStyle } from '@udyamflow/tokens';
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
  const [row] = await db
    .select({ org: schema.organization, settings: schema.tenantSettings })
    .from(schema.organization)
    .leftJoin(
      schema.tenantSettings,
      eq(schema.tenantSettings.organizationId, schema.organization.id),
    )
    .where(eq(schema.organization.slug, orgSlug));
  if (!row) return { title: 'Book — UdyamFlow' };
  const { org, settings } = row;
  // Share previews (WhatsApp, iMessage, Slack) use the tenant's own copy and
  // logo when they've set them.
  const title = settings?.bookingHeadline || `Book with ${org.name}`;
  const description =
    settings?.bookingIntro?.slice(0, 200) ||
    `Reserve a slot with ${org.name}. Powered by UdyamFlow.`;
  return {
    title: `${title} — ${org.name}`,
    description,
    openGraph: {
      title,
      description,
      siteName: org.name,
      type: 'website',
      ...(settings?.logoUrl ? { images: [{ url: settings.logoUrl, alt: org.name }] } : {}),
    },
    ...(settings?.logoUrl ? { icons: { icon: settings.logoUrl } } : {}),
    // Tenant booking pages aren't for general SEO indexing.
    robots: { index: false },
  };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ layout?: string; source?: string; utm_source?: string }>;
}) {
  const { orgSlug } = await params;
  const { layout: layoutParam, source, utm_source } = await searchParams;

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

  // Only advertise memberships when there's something to buy.
  const [membershipPlan] = await db
    .select({ id: schema.membershipPlan.id })
    .from(schema.membershipPlan)
    .where(
      and(eq(schema.membershipPlan.organizationId, org.id), eq(schema.membershipPlan.active, true)),
    )
    .limit(1);

  // ?layout= previews another layout; otherwise the tenant's saved default.
  const layout: BookingLayout = isBookingLayout(layoutParam)
    ? layoutParam
    : isBookingLayout(settings?.bookingLayout)
      ? settings?.bookingLayout
      : 'sidebar';

  const page = (
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
        isOnline: s.isOnline,
        resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId),
      }))}
      layout={layout}
      density={settings?.density === 'compact' ? 'compact' : 'comfortable'}
      headline={settings?.bookingHeadline ?? null}
      intro={settings?.bookingIntro ?? null}
      // Attribution (`?source=google` from Google Business Profile etc.).
      // booking.create sanitizes it; we just forward the raw value.
      source={(source ?? utm_source)?.slice(0, 64)}
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
