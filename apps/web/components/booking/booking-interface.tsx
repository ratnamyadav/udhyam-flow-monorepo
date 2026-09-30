'use client';

import { type TenantTheme, tenantThemeStyle } from '@udyamflow/tokens';
import { Input, Label } from '@udyamflow/ui';
import { useMemo, useState } from 'react';
import {
  type BookingLayout,
  defaultHeadline,
  defaultIntro,
  professionFor,
} from '@/lib/booking-copy';
import { withAlpha } from '@/lib/color';
import { addDaysYmd, ymdInZone } from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';
import { BookingSuccess } from './booking-success';
import { TimezoneHint } from './timezone-hint';

type Layout = BookingLayout;
type Density = 'compact' | 'comfortable';

// Keyboard focus ring in the tenant's accent (all interactive controls).
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
// Picker cards (location / service / resource) follow the density setting via
// the --pad var set by [data-density] on the page root.
const PICKER_PAD = 'calc(var(--pad, 14px) - 4px) var(--pad, 14px)';

export type BookingLocation = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
};

export type BookingResource = {
  id: string;
  name: string;
  title: string | null;
  avatar: string | null;
  locationId: string;
};

export type BookingService = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  currency: string;
  /** Empty = offered by every resource. */
  resourceIds: string[];
};

type Slot = { start: string; end: string; displayTime: string };
type SelectedSlot = Slot & { date: string };

// How many days customers can pick from, and how many columns the inline
// "week" layout renders at once.
const BOOKING_WINDOW_DAYS = 14;
const WEEK_COLUMNS = 5;

function priceFor(cents: number, currency: string) {
  if (cents === 0) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** Calendar label for a YYYY-MM-DD string (already in the location's tz). */
function dayLabel(ymd: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${ymd}T12:00:00.000Z`).toLocaleDateString([], { ...opts, timeZone: 'UTC' });
}

/** Full date for screen readers, e.g. "Tuesday, April 14". */
function spokenDate(ymd: string) {
  return dayLabel(ymd, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function BookingInterface({
  orgSlug,
  theme,
  locations,
  resources,
  services = [],
  layout,
  density = 'comfortable',
  headline,
  intro,
}: {
  orgSlug: string;
  theme: TenantTheme;
  locations: BookingLocation[];
  resources: BookingResource[];
  services?: BookingService[];
  layout: Layout;
  density?: Density;
  /** Tenant's custom headline; null/blank = the profession's default. */
  headline?: string | null;
  /** Tenant's custom intro paragraph (plain text); null/blank = default. */
  intro?: string | null;
}) {
  const profession = professionFor(theme.profession);
  const dense = density === 'compact';
  const customHeadline = headline?.trim() || null;
  const customIntro = intro?.trim() || null;
  const utils = trpc.useUtils();

  // --- Location → resource → service selection -------------------------------
  const [locationId, setLocationId] = useState<string | null>(locations[0]?.id ?? null);
  const location = locations.find((l) => l.id === locationId) ?? locations[0] ?? null;
  const timezone = location?.timezone ?? 'UTC';

  const visibleResources = useMemo(
    () => resources.filter((r) => r.locationId === location?.id),
    [resources, location?.id],
  );
  const [resourceId, setResourceId] = useState<string | null>(null);
  const resource = visibleResources.find((r) => r.id === resourceId) ?? visibleResources[0] ?? null;

  // Only services this resource offers (empty resourceIds = offered by all).
  const eligibleServices = useMemo(
    () =>
      resource
        ? services.filter((s) => s.resourceIds.length === 0 || s.resourceIds.includes(resource.id))
        : [],
    [services, resource],
  );
  const [serviceId, setServiceId] = useState<string | null>(null);
  // Default to the first eligible service — the server requires one whenever
  // the resource offers any.
  const service = eligibleServices.find((s) => s.id === serviceId) ?? eligibleServices[0] ?? null;

  // --- Date selection (in the location's timezone) ---------------------------
  const today = ymdInZone(new Date(), timezone);
  const days = useMemo(
    () => Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => addDaysYmd(today, i)),
    [today],
  );
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate && days.includes(pickedDate) ? pickedDate : today;

  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    referenceCode: string;
    displayTime: string;
    customerName: string;
    resourceName: string;
  } | null>(null);

  function clearSelection() {
    setSelected(null);
    setFormError(null);
  }

  const createCheckout = trpc.payment.createCheckout.useMutation();
  const create = trpc.booking.create.useMutation({
    onSuccess: async (res, vars) => {
      if (res.requiresPayment) {
        // Paid service with a gateway configured — the slot is held while the
        // customer pays. Never show "You're booked" before payment lands.
        setRedirecting(true);
        try {
          const checkout = await createCheckout.mutateAsync({ bookingId: res.id });
          window.location.assign(checkout.redirectUrl);
        } catch (err) {
          setRedirecting(false);
          setFormError(
            err instanceof Error && err.message
              ? `Couldn't start payment: ${err.message}`
              : "Couldn't start payment. Please try again.",
          );
          utils.booking.listSlots.invalidate();
        }
        return;
      }
      if (res.status !== 'confirmed') {
        setFormError('Your booking could not be confirmed. Please try again.');
        return;
      }
      const when = selected
        ? `${dayLabel(selected.date, { weekday: 'short', month: 'short', day: 'numeric' })}, ${selected.displayTime}`
        : '';
      setConfirmation({
        referenceCode: res.referenceCode,
        displayTime: when,
        customerName: vars.customerName,
        resourceName: resource?.name ?? '',
      });
      utils.booking.listSlots.invalidate();
      setSelected(null);
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
    },
    onError: (err) => {
      setFormError(err.message || 'Could not complete the booking.');
      if (err.data?.code === 'CONFLICT') {
        // Someone else grabbed it — refresh availability and drop the pick.
        setSelected(null);
        utils.booking.listSlots.invalidate();
      }
    },
  });

  function selectSlot(s: Slot, slotDate: string) {
    setSelected({ ...s, date: slotDate });
    setFormError(null);
    create.reset();
  }

  function submit() {
    if (!selected || !resource || !location) return;
    if (eligibleServices.length > 0 && !service) {
      setFormError('Please choose a service.');
      return;
    }
    setFormError(null);
    create.mutate({
      orgSlug,
      resourceId: resource.id,
      locationId: location.id,
      serviceId: service?.id,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      slotStart: selected.start,
      slotEnd: selected.end,
    });
  }

  const LocationPicker =
    locations.length > 1 ? (
      <div className="mb-5">
        <div
          id="booking-location-label"
          className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-2"
        >
          Location
        </div>
        <fieldset
          aria-labelledby="booking-location-label"
          className="min-w-0 flex flex-wrap"
          style={{ gap: 'var(--gap, 8px)' }}
        >
          {locations.map((l) => {
            const sel = l.id === location?.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={sel}
                onClick={() => {
                  setLocationId(l.id);
                  setResourceId(null);
                  setServiceId(null);
                  setPickedDate(null);
                  clearSelection();
                }}
                className={`max-w-full min-w-0 border rounded-md text-left transition-colors break-words ${FOCUS}`}
                style={{
                  padding: PICKER_PAD,
                  borderColor: sel ? theme.accent : 'var(--color-border)',
                  background: sel ? withAlpha(theme.accent, '10') : 'var(--color-surface)',
                }}
              >
                <div className="text-[13px] font-medium text-ink">{l.name}</div>
                {l.address && <div className="text-[11px] text-ink-mute">{l.address}</div>}
              </button>
            );
          })}
        </fieldset>
      </div>
    ) : null;

  // Service picker — only renders if this resource offers any service.
  const ServicePicker =
    eligibleServices.length > 0 ? (
      <div className="mb-5">
        <div
          id="booking-service-label"
          className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-2"
        >
          Service
        </div>
        <fieldset
          aria-labelledby="booking-service-label"
          className="min-w-0 grid grid-cols-1 sm:grid-cols-2"
          style={{ gap: 'var(--gap, 8px)' }}
        >
          {eligibleServices.map((s) => {
            const sel = service?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={sel}
                onClick={() => {
                  setServiceId(s.id);
                  clearSelection();
                }}
                className={`min-w-0 border rounded-md text-left transition-colors break-words ${FOCUS}`}
                style={{
                  padding: PICKER_PAD,
                  borderColor: sel ? theme.accent : 'var(--color-border)',
                  background: sel ? withAlpha(theme.accent, '10') : 'var(--color-surface)',
                }}
              >
                <div className="text-[13px] font-medium text-ink">{s.name}</div>
                <div className="text-[11px] text-ink-mute font-mono">
                  {s.durationMin} min · {priceFor(s.priceCents, s.currency)}
                </div>
              </button>
            );
          })}
        </fieldset>
      </div>
    ) : null;

  const DatePicker = (
    // Padding leaves room for the focus ring inside the scroll container. On
    // phones the chips snap so a swipe lands cleanly on a day.
    <fieldset
      aria-label="Date"
      className="min-w-0 flex gap-1.5 overflow-x-auto overscroll-x-contain p-1 -mx-1 mb-3 snap-x snap-mandatory scroll-px-1 md:snap-none"
    >
      {days.map((d) => {
        const sel = d === date;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={sel}
            aria-label={`${d === today ? 'Today, ' : ''}${spokenDate(d)}`}
            onClick={() => {
              setPickedDate(d);
              clearSelection();
            }}
            className={`shrink-0 snap-start border px-2.5 py-1.5 text-center transition-colors ${FOCUS}`}
            style={{
              borderRadius: theme.radius,
              borderColor: sel ? theme.accent : 'var(--color-border)',
              background: sel ? theme.accent : 'var(--color-surface)',
              color: sel ? 'var(--accent-fg)' : 'var(--color-ink)',
            }}
          >
            <div className="text-[10px] uppercase tracking-wider font-mono opacity-80">
              {d === today ? 'Today' : dayLabel(d, { weekday: 'short' })}
            </div>
            <div className="text-[13px] font-medium tabular-nums">
              {dayLabel(d, { day: 'numeric', month: 'short' })}
            </div>
          </button>
        );
      })}
    </fieldset>
  );

  const canSubmit =
    !!selected &&
    customerName.trim().length >= 2 &&
    (eligibleServices.length === 0 || !!service) &&
    !create.isPending &&
    !redirecting;
  // Tenant vars + density + body font on the page root so every child
  // (including BookingSuccess) reads var(--accent-fg), var(--pad), etc.
  const rootProps = {
    'data-density': density,
    style: { ...tenantThemeStyle(theme), fontFamily: 'var(--font-ui)' } as React.CSSProperties,
  };
  const dateHeading = `${date === today ? 'Today' : dayLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })} · ${timezone}`;

  // Early-out success state — replaces the whole interface.
  if (confirmation) {
    return (
      <div
        className={`bg-bg min-h-dvh md:min-h-[860px] px-4 py-8 sm:p-6 ${dense ? 'md:p-8' : 'md:p-12'}`}
        {...rootProps}
      >
        <BookingSuccess
          theme={theme}
          referenceCode={confirmation.referenceCode}
          customerName={confirmation.customerName}
          displayTime={confirmation.displayTime}
          resourceName={confirmation.resourceName}
          timezone={timezone}
        />
      </div>
    );
  }

  const Header = (
    <div className="flex items-center gap-2.5">
      <div
        className="w-10 h-10 grid place-items-center text-sm font-semibold overflow-hidden shrink-0"
        style={{
          background: theme.logoUrl ? 'var(--color-surface)' : theme.accent,
          color: 'var(--accent-fg)',
          borderRadius: theme.radius,
        }}
      >
        {theme.logoUrl ? (
          // Tenant logos live on external object storage, not local assets.
          <img src={theme.logoUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <span aria-hidden>{theme.logo}</span>
        )}
      </div>
      <div className="min-w-0 break-words">
        <div
          className="text-[15px] font-semibold text-ink"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {theme.name}
        </div>
        <div className="text-[12px] text-ink-mute">
          {location?.name || theme.location || profession.name}
        </div>
      </div>
    </div>
  );

  const pickResource = (id: string) => {
    setResourceId(id);
    setServiceId(null);
    clearSelection();
  };

  const ResourcesList =
    visibleResources.length > 0 ? (
      <fieldset
        aria-label={profession.resourcePlural}
        className="min-w-0 flex flex-col"
        style={{ gap: 'var(--gap, 8px)' }}
      >
        {visibleResources.map((r) => {
          const sel = r.id === resource?.id;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={sel}
              onClick={() => pickResource(r.id)}
              className={`w-full flex items-center gap-2.5 rounded-md transition-colors text-left ${FOCUS}`}
              style={{
                padding: PICKER_PAD,
                background: sel ? withAlpha(theme.accent, '10') : 'transparent',
                border: sel
                  ? `1px solid ${withAlpha(theme.accent, '40')}`
                  : '1px solid transparent',
              }}
            >
              <div
                className="w-8 h-8 shrink-0 grid place-items-center text-[11px] font-semibold"
                aria-hidden
                style={{
                  background: sel ? theme.accent : 'var(--color-surface-mute)',
                  color: sel ? 'var(--accent-fg)' : 'var(--color-ink-mute)',
                  borderRadius: 'calc(var(--radius) - 2px)',
                }}
              >
                {r.avatar ?? r.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 break-words">
                <div className="text-[13px] font-medium text-ink">{r.name}</div>
                <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
              </div>
            </button>
          );
        })}
      </fieldset>
    ) : (
      <div className="text-[12px] text-ink-mute">
        No {profession.resourcePlural.toLowerCase()} at this location yet.
      </div>
    );

  const slotArgs = {
    orgSlug,
    locationId: location?.id ?? '',
    resourceId: resource?.id ?? '',
    serviceId: service?.id,
  };
  const slotsEnabled = !!resource && !!location;

  const SlotGrid = (
    <DaySlots
      args={{ ...slotArgs, date }}
      enabled={slotsEnabled}
      theme={theme}
      selected={selected}
      onSelect={(s) => selectSlot(s, date)}
      gridClassName="grid-cols-3 sm:grid-cols-4"
      emptyText={`No availability on this day. Pick another date or a different ${profession.resourcePlural.toLowerCase().replace(/s$/, '')}.`}
    />
  );

  // Shown near the slots only when the visitor's zone differs from the location's.
  const TzHint = <TimezoneHint timezone={timezone} className="-mt-1.5 mb-3" />;

  const CustomerForm = (
    <div className="mt-7 grid gap-3 w-full max-w-[460px]">
      <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono">
        Your details
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cname">Name</Label>
        <Input
          id="cname"
          autoComplete="name"
          className="text-base sm:text-sm"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Full name"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cemail">Email</Label>
          <Input
            id="cemail"
            type="email"
            autoComplete="email"
            className="text-base sm:text-sm"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cphone">Phone</Label>
          <Input
            id="cphone"
            type="tel"
            autoComplete="tel"
            className="text-base sm:text-sm"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>
      {service && service.priceCents > 0 && (
        <div className="text-[12px] text-ink-mute">
          {service.name} · {priceFor(service.priceCents, service.currency)}
        </div>
      )}
      {formError && <div className="text-[12px] text-danger">{formError}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-2 w-full px-6 py-3 text-sm font-medium disabled:opacity-50 ${FOCUS}`}
        style={{ background: theme.accent, color: 'var(--accent-fg)', borderRadius: theme.radius }}
      >
        {redirecting
          ? 'Redirecting to payment…'
          : create.isPending
            ? 'Booking…'
            : selected
              ? `Confirm ${selected.date === today ? '' : `${dayLabel(selected.date, { month: 'short', day: 'numeric' })} `}${selected.displayTime}`
              : 'Pick a slot'}
      </button>
    </div>
  );

  const HeroTitle = (
    <h1
      className="text-[24px] md:text-[28px] m-0 font-medium tracking-tight text-ink break-words"
      style={{ fontFamily: 'var(--font-display)', lineHeight: 1.15 }}
    >
      {customHeadline ?? defaultHeadline(profession, resource?.name)}
    </h1>
  );

  if (layout === 'sidebar') {
    return (
      // Phones: the sidebar stacks above the main column. The minmax(0, …)
      // track keeps the scrolling date strip from widening the page.
      <div
        className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] min-h-dvh md:min-h-[860px] bg-bg"
        {...rootProps}
      >
        <aside
          className={`min-w-0 border-b md:border-b-0 md:border-r border-border bg-surface px-4 py-5 sm:p-6 ${dense ? '' : 'lg:p-8'}`}
        >
          {Header}
          <div className="mt-5 md:mt-7" />
          {LocationPicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            {profession.resourcePlural}
          </div>
          {ResourcesList}
          <div className="border-t border-border my-5 md:my-7" />
          <div className="text-[12px] text-ink-mute leading-relaxed">
            {profession.slotLabel}s last{' '}
            <strong>{service?.durationMin ?? profession.slotDuration} minutes</strong>. Cancel
            anytime up to 24h before.
          </div>
        </aside>
        <main className={`min-w-0 px-4 py-6 sm:p-6 md:p-8 ${dense ? '' : 'lg:p-12'}`}>
          <div className="max-w-[640px]">
            {HeroTitle}
            <p className="text-[14px] text-ink-mute mt-3 max-w-[460px] leading-relaxed whitespace-pre-line break-words">
              {customIntro ?? defaultIntro(profession, resource?.title)}
            </p>
            <div className="mt-6 md:mt-9" />
            {ServicePicker}
            {DatePicker}
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3 break-words">
              {dateHeading}
            </div>
            {TzHint}
            {SlotGrid}
            {CustomerForm}
          </div>
        </main>
      </div>
    );
  }

  if (layout === 'stacked') {
    return (
      <div
        className={`bg-bg min-h-dvh md:min-h-[860px] p-3 sm:p-6 ${dense ? 'md:p-8' : 'md:p-12'}`}
        {...rootProps}
      >
        <div className="max-w-[760px] mx-auto">
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div
              className="px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7"
              style={{ background: theme.accentSoft, color: theme.accentInk }}
            >
              {Header}
              <div className="mt-5">{HeroTitle}</div>
              {customIntro && (
                <p
                  className="text-[14px] mt-3 leading-relaxed whitespace-pre-line break-words"
                  style={{ color: theme.accentInk }}
                >
                  {customIntro}
                </p>
              )}
              <p className="text-[14px] mt-3" style={{ color: theme.accentInk }}>
                {resource?.title ?? profession.name} ·{' '}
                {service?.durationMin ?? profession.slotDuration} minutes
              </p>
            </div>
            <div className={`px-4 py-5 sm:p-6 ${dense ? '' : 'md:p-8'}`}>
              {LocationPicker}
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                {profession.resourcePlural}
              </div>
              {visibleResources.length > 0 ? (
                <fieldset
                  aria-label={profession.resourcePlural}
                  className="min-w-0 grid grid-cols-2 sm:grid-cols-3 mb-7"
                  style={{ gap: 'var(--gap, 8px)' }}
                >
                  {visibleResources.map((r) => {
                    const sel = r.id === resource?.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={sel}
                        onClick={() => pickResource(r.id)}
                        className={`min-w-0 border rounded-lg text-left break-words ${FOCUS}`}
                        style={{
                          padding: PICKER_PAD,
                          borderColor: sel ? theme.accent : 'var(--color-border)',
                          background: sel ? withAlpha(theme.accent, '08') : 'var(--color-surface)',
                        }}
                      >
                        <div className="text-[13px] font-medium text-ink">{r.name}</div>
                        <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
                      </button>
                    );
                  })}
                </fieldset>
              ) : (
                <div className="mb-7">{ResourcesList}</div>
              )}
              {ServicePicker}
              {DatePicker}
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3 break-words">
                Available slots · {dateHeading}
              </div>
              {TzHint}
              {SlotGrid}
              {CustomerForm}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inline week layout — one column per day, starting at the picked date.
  // Below md it collapses to the picked day alone (the date chips move it).
  const weekDays = days.slice(days.indexOf(date), days.indexOf(date) + WEEK_COLUMNS);
  return (
    <div
      className={`bg-bg min-h-dvh md:min-h-[860px] p-3 sm:p-6 ${dense ? '' : 'md:p-10'}`}
      {...rootProps}
    >
      <div className="max-w-[1100px] mx-auto">
        <div className="flex flex-wrap justify-between items-start gap-x-4 gap-y-2 mb-6 md:mb-8 px-1 sm:px-0">
          {Header}
          <div className="text-[11px] text-ink-soft font-mono break-all">{timezone}</div>
        </div>
        {(customHeadline || customIntro) && (
          <div className="mb-6 md:mb-8 max-w-[640px] px-1 sm:px-0">
            {customHeadline && HeroTitle}
            {customIntro && (
              <p className="text-[14px] text-ink-mute mt-3 leading-relaxed whitespace-pre-line break-words">
                {customIntro}
              </p>
            )}
          </div>
        )}
        <div
          className={`bg-surface border border-border rounded-2xl px-4 py-5 sm:p-6 ${dense ? '' : 'md:p-8'}`}
        >
          {LocationPicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            {profession.resourcePlural}
          </div>
          {ResourcesList}
          <div className="mt-7" />
          {ServicePicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3 break-words">
            <span className="md:hidden">{dateHeading}</span>
            <span className="hidden md:inline">
              Week of {dayLabel(date, { month: 'short', day: 'numeric' })} · {timezone}
            </span>
          </div>
          {DatePicker}
          {TzHint}
          <div
            className="grid grid-cols-1 md:grid-cols-[repeat(var(--week-cols),minmax(0,1fr))]"
            style={
              {
                gap: 'var(--gap, 12px)',
                '--week-cols': String(weekDays.length),
              } as React.CSSProperties
            }
          >
            {weekDays.map((d, i) => (
              // Only the picked day (first column) shows on phones.
              <div key={d} className={i === 0 ? 'min-w-0' : 'min-w-0 hidden md:block'}>
                {/* On phones the heading above already names the day. */}
                <div className="hidden md:block text-[11px] font-medium text-ink mb-2">
                  {d === today ? 'Today' : dayLabel(d, { weekday: 'short' })}{' '}
                  <span className="text-ink-mute font-mono">
                    {dayLabel(d, { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <DaySlots
                  args={{ ...slotArgs, date: d }}
                  enabled={slotsEnabled}
                  theme={theme}
                  selected={selected}
                  onSelect={(s) => selectSlot(s, d)}
                  gridClassName="grid-cols-3 sm:grid-cols-4 md:grid-cols-1"
                  emptyText="No slots"
                />
              </div>
            ))}
          </div>
          {CustomerForm}
        </div>
      </div>
    </div>
  );
}

function DaySlots({
  args,
  enabled,
  theme,
  selected,
  onSelect,
  gridClassName,
  emptyText,
}: {
  args: {
    orgSlug: string;
    locationId: string;
    resourceId: string;
    serviceId?: string;
    date: string;
  };
  enabled: boolean;
  theme: TenantTheme;
  selected: SelectedSlot | null;
  onSelect: (s: Slot) => void;
  /** Tailwind grid-cols-* classes (responsive) for the slot buttons. */
  gridClassName: string;
  emptyText: string;
}) {
  const query = trpc.booking.listSlots.useQuery(args, { enabled, staleTime: 30_000 });
  const slots: Slot[] = query.data?.slots ?? [];

  if (enabled && query.isLoading) {
    return <div className="text-[12px] text-ink-mute py-6">Loading availability…</div>;
  }
  if (query.error) {
    return <div className="text-[12px] text-danger py-6">{query.error.message}</div>;
  }
  if (slots.length === 0) {
    return <div className="text-[12px] text-ink-mute py-6">{emptyText}</div>;
  }
  return (
    <fieldset
      aria-label={`Available times, ${spokenDate(args.date)}`}
      className={`min-w-0 grid ${gridClassName}`}
      style={{ gap: 'var(--gap, 8px)' }}
    >
      {slots.map((s) => {
        const sel = selected?.start === s.start;
        return (
          <button
            key={s.start}
            type="button"
            aria-pressed={sel}
            aria-label={`${spokenDate(args.date)} at ${s.displayTime}`}
            onClick={() => onSelect(s)}
            className={`py-1 text-[13px] font-medium border transition-colors ${FOCUS}`}
            style={{
              minHeight: 'var(--row-h, 36px)',
              borderRadius: theme.radius,
              borderColor: sel ? theme.accent : 'var(--color-border)',
              color: sel ? 'var(--accent-fg)' : 'var(--color-ink)',
              background: sel ? theme.accent : 'var(--color-surface)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {s.displayTime}
          </button>
        );
      })}
    </fieldset>
  );
}
