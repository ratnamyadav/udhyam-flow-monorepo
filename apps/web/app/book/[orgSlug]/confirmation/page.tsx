import { db, schema } from '@udyamflow/db';
import { tenantThemeStyle } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { BookingSuccess } from '@/components/booking/booking-success';
import { settingsToTheme } from '@/lib/theme';

// Landing page after Stripe / Cashfree checkout returns the customer.
// Bookings stay `pending` until the webhook flips them paid, so this page
// auto-refreshes a few times to catch the webhook race.

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ booking?: string; status?: string }>;
}) {
  const { orgSlug } = await params;
  const { booking: bookingId, status } = await searchParams;

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, orgSlug));
  if (!org) notFound();

  const [settings] = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, org.id));

  const theme = settingsToTheme({
    org: { id: org.id, name: org.name, slug: org.slug, logo: org.logo },
    settings: settings ?? null,
  });
  const styleVars = tenantThemeStyle(theme);

  if (!bookingId) {
    return (
      <Shell theme={theme} styleVars={styleVars}>
        <FallbackCard
          title="Nothing to confirm"
          body="We didn't find a booking in this URL."
          href={`/book/${orgSlug}`}
          cta="Back to booking"
        />
      </Shell>
    );
  }

  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
  if (!booking || booking.organizationId !== org.id) {
    return (
      <Shell theme={theme} styleVars={styleVars}>
        <FallbackCard
          title="Booking not found"
          body="The reference in the URL doesn't match a booking we have on file."
          href={`/book/${orgSlug}`}
          cta="Start over"
        />
      </Shell>
    );
  }

  const [resource] = await db
    .select()
    .from(schema.resource)
    .where(eq(schema.resource.id, booking.resourceId));

  const [location] = await db
    .select()
    .from(schema.location)
    .where(eq(schema.location.id, booking.locationId));

  // Customer cancelled at the gateway — slot is still held briefly.
  if (status === 'cancelled') {
    return (
      <Shell theme={theme} styleVars={styleVars}>
        <FallbackCard
          title="Checkout cancelled"
          body="Your slot is still held for the next 10 minutes if you want to retry."
          href={`/book/${orgSlug}`}
          cta="Back to booking"
        />
      </Shell>
    );
  }

  const displayTime = booking.slotStart.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: location?.timezone ?? 'UTC',
  });
  const referenceCode = booking.id.slice(-6).toUpperCase();

  // Payment status comes from the webhook — show pending state if it
  // hasn't landed yet. The meta-refresh below polls a few times.
  const stillPending = booking.paymentStatus === 'pending';

  return (
    <Shell theme={theme} styleVars={styleVars} autoRefresh={stillPending}>
      {stillPending ? (
        <div className="max-w-[460px] mx-auto text-center">
          <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-3 font-mono">
            Awaiting confirmation
          </div>
          <h1 className="text-[28px] font-medium tracking-tight text-ink m-0">
            We're confirming your payment…
          </h1>
          <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
            This usually takes a few seconds. This page will refresh on its own; you'll see the full
            confirmation once the bank notifies us. Reference{' '}
            <span className="font-mono">{referenceCode}</span>.
          </p>
        </div>
      ) : (
        <BookingSuccess
          theme={theme}
          referenceCode={referenceCode}
          customerName={booking.customerName}
          displayTime={displayTime}
          resourceName={resource?.name ?? ''}
          timezone={location?.timezone ?? 'UTC'}
        />
      )}
    </Shell>
  );
}

function Shell({
  theme,
  styleVars,
  autoRefresh,
  children,
}: {
  theme: ReturnType<typeof settingsToTheme>;
  styleVars: React.CSSProperties;
  autoRefresh?: boolean;
  children: React.ReactNode;
}) {
  void theme;
  return (
    <div className="bg-bg p-12 min-h-[100vh]" style={styleVars}>
      {autoRefresh && (
        // Meta-refresh lets the webhook-flip resolve without us needing
        // a client component on this otherwise-server page.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <meta httpEquiv="refresh" content="5" />
      )}
      {children}
    </div>
  );
}

function FallbackCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="max-w-[460px] mx-auto">
      <h1 className="text-[28px] m-0 font-medium tracking-tight text-ink">{title}</h1>
      <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">{body}</p>
      <a
        href={href}
        className="mt-6 inline-block px-5 py-2.5 text-white text-[13px] font-medium rounded-md"
        style={{ background: 'var(--accent)' }}
      >
        {cta}
      </a>
    </div>
  );
}
