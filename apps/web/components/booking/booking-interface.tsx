'use client';

import {
  PROFESSIONS,
  type ProfessionId,
  type TenantTheme,
  tenantThemeStyle,
} from '@udyamflow/tokens';
import { Input, Label } from '@udyamflow/ui';
import { useMemo, useState } from 'react';
import { withAlpha } from '@/lib/color';
import { addDaysYmd, ymdInZone } from '@/lib/timezones';
import { trpc } from '@/lib/trpc/react';
import { BookingSuccess } from './booking-success';

type Layout = 'sidebar' | 'stacked' | 'inline';

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

export function BookingInterface({
  orgSlug,
  theme,
  locations,
  resources,
  services = [],
  layout,
}: {
  orgSlug: string;
  theme: TenantTheme;
  locations: BookingLocation[];
  resources: BookingResource[];
  services?: BookingService[];
  layout: Layout;
}) {
  const profession = PROFESSIONS[theme.profession as ProfessionId] ?? PROFESSIONS.doctor;
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
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-2">
          Location
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => {
            const sel = l.id === location?.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLocationId(l.id);
                  setResourceId(null);
                  setServiceId(null);
                  setPickedDate(null);
                  clearSelection();
                }}
                className="border rounded-md px-3 py-2 text-left transition-colors"
                style={{
                  borderColor: sel ? theme.accent : 'var(--color-border)',
                  background: sel ? withAlpha(theme.accent, '10') : 'var(--color-surface)',
                }}
              >
                <div className="text-[13px] font-medium text-ink">{l.name}</div>
                {l.address && <div className="text-[11px] text-ink-mute">{l.address}</div>}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  // Service picker — only renders if this resource offers any service.
  const ServicePicker =
    eligibleServices.length > 0 ? (
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-2">
          Service
        </div>
        <div className="grid grid-cols-2 gap-2">
          {eligibleServices.map((s) => {
            const sel = service?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  clearSelection();
                }}
                className="border rounded-md px-3 py-2 text-left transition-colors"
                style={{
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
        </div>
      </div>
    ) : null;

  const DatePicker = (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {days.map((d) => {
        const sel = d === date;
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              setPickedDate(d);
              clearSelection();
            }}
            className="shrink-0 border px-2.5 py-1.5 text-center transition-colors"
            style={{
              borderRadius: theme.radius,
              borderColor: sel ? theme.accent : 'var(--color-border)',
              background: sel ? theme.accent : 'var(--color-surface)',
              color: sel ? '#fff' : 'var(--color-ink)',
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
    </div>
  );

  const canSubmit =
    !!selected &&
    customerName.trim().length >= 2 &&
    (eligibleServices.length === 0 || !!service) &&
    !create.isPending &&
    !redirecting;
  const styleVars = tenantThemeStyle(theme);
  const dateHeading = `${date === today ? 'Today' : dayLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })} · ${timezone}`;

  // Early-out success state — replaces the whole interface.
  if (confirmation) {
    return (
      <div className="bg-bg p-12 min-h-[860px]" style={styleVars}>
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
        className="w-10 h-10 grid place-items-center text-white text-sm font-semibold"
        style={{ background: theme.accent, borderRadius: theme.radius }}
      >
        {theme.logo}
      </div>
      <div>
        <div
          className="text-[15px] font-semibold text-ink"
          style={{ fontFamily: theme.fontDisplay }}
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
      <div className="space-y-2">
        {visibleResources.map((r) => {
          const sel = r.id === resource?.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => pickResource(r.id)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left"
              style={{
                background: sel ? withAlpha(theme.accent, '10') : 'transparent',
                border: sel
                  ? `1px solid ${withAlpha(theme.accent, '40')}`
                  : '1px solid transparent',
              }}
            >
              <div
                className="w-8 h-8 grid place-items-center text-[11px] font-semibold"
                style={{
                  background: sel ? theme.accent : 'var(--color-surface-mute)',
                  color: sel ? '#fff' : 'var(--color-ink-mute)',
                  borderRadius: 'calc(var(--radius) - 2px)',
                }}
              >
                {r.avatar ?? r.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-[13px] font-medium text-ink">{r.name}</div>
                <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
              </div>
            </button>
          );
        })}
      </div>
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
      columns={4}
      emptyText={`No availability on this day. Pick another date or a different ${profession.resourcePlural.toLowerCase().replace(/s$/, '')}.`}
    />
  );

  const CustomerForm = (
    <div className="mt-7 grid gap-3 max-w-[460px]">
      <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono">
        Your details
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cname">Name</Label>
        <Input
          id="cname"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Full name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cemail">Email</Label>
          <Input
            id="cemail"
            type="email"
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
        className="mt-2 px-6 py-3 text-white text-sm font-medium disabled:opacity-50"
        style={{ background: theme.accent, borderRadius: theme.radius }}
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
      className="text-[28px] m-0 font-medium tracking-tight text-ink"
      style={{ fontFamily: theme.fontDisplay, lineHeight: 1.15 }}
    >
      Book a {profession.slotLabel.toLowerCase()}
      {resource ? ` with ${resource.name.split(' ')[0]}` : ''}
    </h1>
  );

  if (layout === 'sidebar') {
    return (
      <div className="grid grid-cols-[360px_1fr] min-h-[860px] bg-bg" style={styleVars}>
        <aside className="p-8 border-r border-border bg-surface">
          {Header}
          <div className="mt-7" />
          {LocationPicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            {profession.resourcePlural}
          </div>
          {ResourcesList}
          <div className="border-t border-border my-7" />
          <div className="text-[12px] text-ink-mute leading-relaxed">
            {profession.slotLabel}s last{' '}
            <strong>{service?.durationMin ?? profession.slotDuration} minutes</strong>. Cancel
            anytime up to 24h before.
          </div>
        </aside>
        <main className="p-12">
          <div className="max-w-[640px]">
            {HeroTitle}
            <p className="text-[14px] text-ink-mute mt-3 max-w-[460px] leading-relaxed">
              {resource?.title ?? profession.name}. Pick a slot below — we'll email a confirmation.
            </p>
            <div className="mt-9" />
            {ServicePicker}
            {DatePicker}
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
              {dateHeading}
            </div>
            {SlotGrid}
            {CustomerForm}
          </div>
        </main>
      </div>
    );
  }

  if (layout === 'stacked') {
    return (
      <div className="bg-bg p-12 min-h-[860px]" style={styleVars}>
        <div className="max-w-[760px] mx-auto">
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div
              className="px-8 py-7"
              style={{ background: theme.accentSoft, color: theme.accentInk }}
            >
              {Header}
              <div className="mt-5">{HeroTitle}</div>
              <p className="text-[14px] mt-3" style={{ color: theme.accentInk }}>
                {resource?.title ?? profession.name} ·{' '}
                {service?.durationMin ?? profession.slotDuration} minutes
              </p>
            </div>
            <div className="p-8">
              {LocationPicker}
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                {profession.resourcePlural}
              </div>
              {visibleResources.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 mb-7">
                  {visibleResources.map((r) => {
                    const sel = r.id === resource?.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickResource(r.id)}
                        className="border rounded-lg px-3 py-2.5 text-left"
                        style={{
                          borderColor: sel ? theme.accent : 'var(--color-border)',
                          background: sel ? withAlpha(theme.accent, '08') : 'var(--color-surface)',
                        }}
                      >
                        <div className="text-[13px] font-medium text-ink">{r.name}</div>
                        <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mb-7">{ResourcesList}</div>
              )}
              {ServicePicker}
              {DatePicker}
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                Available slots · {dateHeading}
              </div>
              {SlotGrid}
              {CustomerForm}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inline week layout — one column per day, starting at the picked date.
  const weekDays = days.slice(days.indexOf(date), days.indexOf(date) + WEEK_COLUMNS);
  return (
    <div className="bg-bg p-10 min-h-[860px]" style={styleVars}>
      <div className="max-w-[1100px] mx-auto">
        <div className="flex justify-between items-start mb-8">
          {Header}
          <div className="text-[11px] text-ink-soft font-mono">{timezone}</div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-8">
          {LocationPicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            {profession.resourcePlural}
          </div>
          {ResourcesList}
          <div className="mt-7" />
          {ServicePicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            Week of {dayLabel(date, { month: 'short', day: 'numeric' })} · {timezone}
          </div>
          {DatePicker}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
          >
            {weekDays.map((d) => (
              <div key={d}>
                <div className="text-[11px] font-medium text-ink mb-2">
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
                  columns={1}
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
  columns,
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
  columns: number;
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
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {slots.map((s) => {
        const sel = selected?.start === s.start;
        return (
          <button
            key={s.start}
            type="button"
            onClick={() => onSelect(s)}
            className="py-2 text-[13px] font-medium border transition-colors"
            style={{
              borderRadius: theme.radius,
              borderColor: sel ? theme.accent : 'var(--color-border)',
              color: sel ? '#fff' : 'var(--color-ink)',
              background: sel ? theme.accent : 'var(--color-surface)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {s.displayTime}
          </button>
        );
      })}
    </div>
  );
}
