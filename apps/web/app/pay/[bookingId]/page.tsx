import { db, schema } from '@udyamflow/db';
import { tenantThemeStyle } from '@udyamflow/tokens';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { settingsToTheme } from '@/lib/theme';
import { PayRedirect } from './pay-redirect';

// Pay link from the WhatsApp/SMS reminder (`/pay/<bookingId>`). The booking
// id is the unguessable capability, same as payment.createCheckout. We
// render a tiny page that starts checkout client-side instead of creating
// it during the GET — WhatsApp's link-preview crawler fetches every URL it
// sees, and a crawler shouldn't open gateway orders.

export const metadata: Metadata = {
  title: 'Pay for your booking — UdyamFlow',
  robots: { index: false, follow: false },
};

function priceFor(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export default async function PayPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;

  const [booking] = await db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
  if (!booking) {
    return (
      <Message
        title="Booking not found"
        body="This payment link doesn't match a booking we have on file. Please check the link or contact the business."
      />
    );
  }

  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, booking.organizationId));
  const [settings] = await db
    .select()
    .from(schema.tenantSettings)
    .where(eq(schema.tenantSettings.organizationId, booking.organizationId));
  const theme = settingsToTheme({
    org: org ? { id: org.id, name: org.name, slug: org.slug, logo: org.logo } : null,
    settings: settings ?? null,
  });
  const styleVars = tenantThemeStyle(theme);
  const bookHref = org ? `/book/${org.slug}` : '/';

  const [svc] = booking.serviceId
    ? await db.select().from(schema.service).where(eq(schema.service.id, booking.serviceId))
    : [];
  const [loc] = await db
    .select({ timezone: schema.location.timezone })
    .from(schema.location)
    .where(eq(schema.location.id, booking.locationId));

  if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'partially_refunded') {
    return (
      <Message
        styleVars={styleVars}
        title="Already paid"
        body="Thanks — we've already received payment for this booking. Nothing more to do."
      />
    );
  }
  if (booking.status === 'expired') {
    return (
      <Message
        styleVars={styleVars}
        title="This slot was released"
        body="Payment wasn't completed in time, so the slot was released. Please book again."
        href={bookHref}
        cta="Book again"
      />
    );
  }
  if (booking.status === 'cancelled' || booking.paymentStatus === 'refunded') {
    return (
      <Message
        styleVars={styleVars}
        title="Booking cancelled"
        body="This booking has been cancelled, so there's nothing to pay."
        href={bookHref}
        cta="Book again"
      />
    );
  }
  // Price snapshot taken at booking time; older bookings use the service's.
  const amountCents = booking.amountCents ?? svc?.priceCents ?? 0;
  const currency = booking.currency ?? svc?.currency ?? 'INR';
  if (amountCents === 0) {
    return (
      <Message
        styleVars={styleVars}
        title="Nothing to pay"
        body="This booking is free — just turn up at your appointment time."
      />
    );
  }

  const when = booking.slotStart.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: loc?.timezone ?? 'UTC',
  });

  return (
    <div className="bg-bg p-12 min-h-[100vh]" style={styleVars}>
      <div className="max-w-[460px] mx-auto">
        <div className="text-[11px] text-ink-soft uppercase tracking-wider mb-3 font-mono">
          {org?.name ?? 'Payment'}
        </div>
        <h1 className="text-[28px] m-0 font-medium tracking-tight text-ink">
          Pay {priceFor(amountCents, currency)}
        </h1>
        <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">
          {svc?.name ?? 'Your booking'} on <strong className="text-ink">{when}</strong>. Reference{' '}
          <span className="font-mono">{booking.id.slice(-6).toUpperCase()}</span>.
        </p>
        <PayRedirect bookingId={booking.id} />
      </div>
    </div>
  );
}

function Message({
  title,
  body,
  styleVars,
  href,
  cta,
}: {
  title: string;
  body: string;
  styleVars?: React.CSSProperties;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="bg-bg p-12 min-h-[100vh]" style={styleVars}>
      <div className="max-w-[460px] mx-auto">
        <h1 className="text-[28px] m-0 font-medium tracking-tight text-ink">{title}</h1>
        <p className="text-[14px] text-ink-mute mt-3 leading-relaxed">{body}</p>
        {href && cta && (
          <a
            href={href}
            className="mt-6 inline-block px-5 py-2.5 text-[var(--accent-fg,#fff)] text-[13px] font-medium rounded-md"
            style={{ background: 'var(--accent, #1a1815)' }}
          >
            {cta}
          </a>
        )}
      </div>
    </div>
  );
}
