import { db, schema } from '@udyamflow/db';
import { PROFESSIONS, type ProfessionId } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { BookingInterface } from '@/components/booking/booking-interface';
import { settingsToTheme } from '@/lib/theme';

type Layout = 'sidebar' | 'stacked' | 'inline';
const LAYOUTS = ['sidebar', 'stacked', 'inline'] as const;

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ layout?: string }>;
}) {
  const { orgSlug } = await params;
  const { layout: layoutParam } = await searchParams;

  // Resolve org + tenantSettings + resources in one shot.
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, orgSlug));
  if (!org) notFound();

  const [settings] = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, org.id));

  const resources = await db
    .select()
    .from(schema.resource)
    .where(eq(schema.resource.organizationId, org.id));

  const theme = settingsToTheme({
    org: { id: org.id, name: org.name, slug: org.slug, logo: org.logo },
    settings: settings ?? null,
  });

  const profession = PROFESSIONS[(settings?.profession ?? 'doctor') as ProfessionId];
  const slots = profession.sampleSlots;

  const layout: Layout = LAYOUTS.includes(layoutParam as Layout)
    ? (layoutParam as Layout)
    : 'sidebar';

  return (
    <BookingInterface
      theme={theme}
      resources={resources.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        avatar: r.avatar,
      }))}
      slots={slots}
      layout={layout}
    />
  );
}
