import { db, schema } from '@udyamflow/db';
import { type TenantTheme, tenantThemeStyle } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { BookingSuccess } from '@/components/booking/booking-success';
import { settingsToTheme } from '@/lib/theme';

// Landing page after Stripe / Cashfree checkout returns the customer.
// Paid bookings stay `pending_payment` until the gateway webhook confirms
// them, so this page auto-refreshes a bounded number of times to catch the
// webhook race, then falls back to "we'll email / text you".

const MAX_REFRESH_ATTEMPTS = 10;
const REFRESH_SECONDS = 5;

function formatInZone(date: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return date.toLocaleString([], { ...opts, timeZone });
  } catch {
    return date.toLocaleString([], opts);
  }
}

export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ booking?: string; status?: string; attempt?: string }>;
}) {
  const { orgSlug } = await params;
  const { booking: bookingId, status, attempt: attemptParam } = await searchParams;
  const attempt = Math.max(0, Math.min(Number.parseInt(attemptParam ?? '0', 10) || 0, 1000));

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
  const brand: Brand = {
    theme,
    style: { ...tenantThemeStyle(theme), fontFamily: 'var(--font-ui)' },
    density: settings?.density === 'compact' ? 'compact' : 'comfortable',
  };
  const backHref = `/book/${orgSlug}`;

  if (!bookingId) {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="Nothing to confirm"
          body="We didn't find a booking in this URL."
          href={backHref}
          cta="Back to booking"
        />
      </Shell>
    );
  }

  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
  if (!booking || booking.organizationId !== org.id) {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="Booking not found"
          body="The reference in the URL doesn't match a booking we have on file."
          href={backHref}
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

  const timezone = location?.timezone ?? 'UTC';
  const referenceCode = booking.id.slice(-6).toUpperCase();
  const displayTime = formatInZone(booking.slotStart, timezone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (booking.status === 'confirmed' || booking.status === 'completed') {
    return (
      <Shell brand={brand}>
        <BookingSuccess
          theme={theme}
          referenceCode={referenceCode}
          customerName={booking.customerName}
          displayTime={displayTime}
          resourceName={resource?.name ?? ''}
          timezone={timezone}
        />
      </Shell>
    );
  }

  if (booking.status === 'expired') {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="Your hold expired"
          body={`We held ${displayTime} while you paid, but payment didn't complete in time, so the slot was released. You haven't been charged — pick a new time to book again. Reference ${referenceCode}.`}
          href={backHref}
          cta="Pick a new time"
        />
      </Shell>
    );
  }

  if (booking.status === 'cancelled') {
    const refunded =
      booking.paymentStatus === 'refunded' || booking.paymentStatus === 'partially_refunded';
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="This booking was cancelled"
          body={`The booking for ${displayTime} (reference ${referenceCode}) is cancelled.${
            refunded ? ' Your refund is on its way to the original payment method.' : ''
          }`}
          href={backHref}
          cta="Book another time"
        />
      </Shell>
    );
  }

  if (booking.status === 'no_show') {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="This booking is closed"
          body={`Reference ${referenceCode} for ${displayTime} is no longer active.`}
          href={backHref}
          cta="Book another time"
        />
      </Shell>
    );
  }

  // --- pending_payment -------------------------------------------------------
  const holdExpiresAt = booking.holdExpiresAt;
  const holdLive = !!holdExpiresAt && holdExpiresAt.getTime() > Date.now();
  const holdUntil = holdExpiresAt
    ? formatInZone(holdExpiresAt, timezone, { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  if (booking.paymentStatus === 'failed') {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="Payment didn't go through"
          body={`Your bank declined or couldn't complete the payment, so ${displayTime} isn't booked yet. You haven't been charged. Please try again.`}
          href={backHref}
          cta="Try again"
        />
      </Shell>
    );
  }

  if (!holdLive) {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="Your hold expired"
          body={`Payment didn't complete before the hold on ${displayTime} ran out, so the slot has been released. If you see a charge, contact ${org.name} and quote reference ${referenceCode}.`}
          href={backHref}
          cta="Pick a new time"
        />
      </Shell>
    );
  }

  // Customer backed out at the gateway — slot is still held until the hold lapses.
  if (status === 'cancelled') {
    return (
      <Shell brand={brand}>
        <FallbackCard
          title="Checkout cancelled"
          body={`You weren't charged. We're holding ${displayTime} for you until ${holdUntil} (${timezone}); after that the slot is released.`}
          href={backHref}
          cta="Back to booking"
        />
      </Shell>
    );
  }

  // Waiting on the webhook. Refresh a bounded number of times.
  const canRefresh = attempt < MAX_REFRESH_ATTEMPTS;
  const refreshUrl = `/book/${encodeURIComponent(orgSlug)}/confirmation?booking=${encodeURIComponent(
    booking.id,
  )}&attempt=${attempt + 1}`;

  return (
    <Shell brand={brand} refreshUrl={canRefresh ? refreshUrl : undefined}>
      <div className="max-w-[460px] mx-auto text-center">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-3 font-mono">
          Awaiting confirmation
        </div>
        {canRefresh ? (
          <>
            <h1
              className="text-[28px] font-medium tracking-tight text-ink m-0"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              We're confirming your payment…
            </h1>
            <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
              This usually takes a few seconds. This page refreshes on its own; you'll see the full
              confirmation once the bank notifies us. Reference{' '}
              <span className="font-mono">{referenceCode}</span>.
            </p>
          </>
        ) : (
          <>
            <h1
              className="text-[28px] font-medium tracking-tight text-ink m-0"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Your payment is still processing
            </h1>
            <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
              We haven't heard back from the bank yet. There's nothing more you need to do — we'll
              email or text you as soon as {displayTime} is confirmed. Reference{' '}
              <span className="font-mono">{referenceCode}</span>.
            </p>
          </>
        )}
      </div>
    </Shell>
  );
}

type Brand = {
  theme: TenantTheme;
  style: React.CSSProperties;
  density: 'compact' | 'comfortable';
};

function Shell({
  brand,
  refreshUrl,
  children,
}: {
  brand: Brand;
  refreshUrl?: string;
  children: React.ReactNode;
}) {
  const { theme } = brand;
  return (
    <div className="bg-bg p-12 min-h-[100vh]" style={brand.style} data-density={brand.density}>
      {/* Tenant header so the post-checkout page is recognisably theirs. */}
      <div className="max-w-[460px] mx-auto mb-10 flex items-center gap-2.5">
        <div
          className="w-9 h-9 grid place-items-center text-[12px] font-semibold overflow-hidden shrink-0"
          style={{
            background: theme.logoUrl ? 'var(--color-surface)' : 'var(--accent)',
            color: 'var(--accent-fg)',
            borderRadius: 'var(--radius)',
          }}
        >
          {theme.logoUrl ? (
            <img src={theme.logoUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <span aria-hidden>{theme.logo}</span>
          )}
        </div>
        <div
          className="text-[15px] font-semibold text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {theme.name}
        </div>
      </div>
      {refreshUrl && (
        // Meta-refresh lets the webhook-flip resolve without a client component
        // on this otherwise-server page. The URL carries an attempt counter so
        // it stops after MAX_REFRESH_ATTEMPTS.
        <meta httpEquiv="refresh" content={`${REFRESH_SECONDS};url=${refreshUrl}`} />
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
      <h1
        className="text-[28px] m-0 font-medium tracking-tight text-ink"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h1>
      <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">{body}</p>
      <a
        href={href}
        className="mt-6 inline-block px-5 py-2.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{
          background: 'var(--accent)',
          color: 'var(--accent-fg)',
          borderRadius: 'var(--radius)',
        }}
      >
        {cta}
      </a>
    </div>
  );
}
