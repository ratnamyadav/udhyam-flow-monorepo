'use client';

import {
  PROFESSIONS,
  type ProfessionId,
  type TenantTheme,
  tenantThemeStyle,
} from '@udyamflow/tokens';
import { Input, Label } from '@udyamflow/ui';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/react';
import { BookingSuccess } from './booking-success';

type Layout = 'sidebar' | 'stacked' | 'inline';

export type BookingResource = {
  id: string;
  name: string;
  title: string | null;
  avatar: string | null;
};

export type BookingService = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  currency: string;
};

type Slot = { start: string; end: string; displayTime: string };

function priceFor(cents: number, currency: string) {
  if (cents === 0) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function BookingInterface({
  orgSlug,
  theme,
  resources,
  services = [],
  locationId,
  timezone,
  layout,
}: {
  orgSlug: string;
  theme: TenantTheme;
  resources: BookingResource[];
  services?: BookingService[];
  locationId: string | null;
  timezone: string;
  layout: Layout;
}) {
  const profession = PROFESSIONS[theme.profession as ProfessionId] ?? PROFESSIONS.doctor;
  const [resourceIdx, setResourceIdx] = useState(0);
  const resource = resources[resourceIdx] ?? null;
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);

  // Fetch real slots from the active resource + location. Disabled until we
  // have both (no resources / no location → empty state).
  const slotsQuery = trpc.booking.listSlots.useQuery(
    {
      orgSlug,
      locationId: locationId ?? '',
      resourceId: resource?.id ?? '',
      serviceId,
    },
    { enabled: !!resource && !!locationId },
  );
  const slots: Slot[] = slotsQuery.data?.slots ?? [];

  const [selected, setSelected] = useState<Slot | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [confirmation, setConfirmation] = useState<{
    referenceCode: string;
    displayTime: string;
    customerName: string;
    resourceName: string;
  } | null>(null);

  const createCheckout = trpc.payment.createCheckout.useMutation();
  const create = trpc.booking.create.useMutation({
    onSuccess: async (res, vars) => {
      const slot = slots.find((s) => s.start === vars.slotStart);
      // If the picked service has a price + a provider is configured for its
      // currency, the booking is `unpaid` until the gateway webhook flips it.
      // Redirect to checkout before showing the confirmation card.
      if (serviceId) {
        try {
          const checkout = await createCheckout.mutateAsync({
            bookingId: res.id,
            returnUrl: `${window.location.origin}/book/${orgSlug}/confirmation`,
          });
          window.location.assign(checkout.redirectUrl);
          return;
        } catch (err) {
          // Provider unset / free service → fall through to the success card.
          if (!(err instanceof Error && err.message.includes('No payment provider'))) {
            console.warn('payment.createCheckout failed', err);
          }
        }
      }
      setConfirmation({
        referenceCode: res.referenceCode,
        displayTime: slot?.displayTime ?? '',
        customerName: vars.customerName,
        resourceName: resource?.name ?? '',
      });
      slotsQuery.refetch();
      setSelected(null);
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
    },
  });

  function selectSlot(s: Slot) {
    setSelected(s);
    create.reset();
  }

  function submit() {
    if (!selected || !resource || !locationId) return;
    create.mutate({
      orgSlug,
      resourceId: resource.id,
      locationId,
      serviceId,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      slotStart: selected.start,
      slotEnd: selected.end,
    });
  }

  // Service picker — only renders if the tenant has a non-empty catalog.
  const ServicePicker =
    services.length > 0 ? (
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-2">
          Service
        </div>
        <div className="grid grid-cols-2 gap-2">
          {services.map((s) => {
            const sel = serviceId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  setSelected(null);
                }}
                className="border rounded-md px-3 py-2 text-left transition-colors"
                style={{
                  borderColor: sel ? theme.accent : 'var(--color-border)',
                  background: sel ? `${theme.accent}10` : 'var(--color-surface)',
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

  const canSubmit = !!selected && customerName.trim().length >= 2 && !create.isPending;
  const styleVars = tenantThemeStyle(theme);

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
        <div className="text-[12px] text-ink-mute">{theme.location || profession.name}</div>
      </div>
    </div>
  );

  const ResourcesList =
    resources.length > 0 ? (
      <div className="space-y-2">
        {resources.map((r, i) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              setResourceIdx(i);
              setSelected(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left"
            style={{
              background: i === resourceIdx ? `${theme.accent}10` : 'transparent',
              border: i === resourceIdx ? `1px solid ${theme.accent}40` : '1px solid transparent',
            }}
          >
            <div
              className="w-8 h-8 grid place-items-center text-[11px] font-semibold"
              style={{
                background: i === resourceIdx ? theme.accent : 'var(--color-surface-mute)',
                color: i === resourceIdx ? '#fff' : 'var(--color-ink-mute)',
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
        ))}
      </div>
    ) : (
      <div className="text-[12px] text-ink-mute">
        No {profession.resourcePlural.toLowerCase()} yet.
      </div>
    );

  const SlotGrid = (
    <div>
      {slotsQuery.isLoading ? (
        <div className="text-[12px] text-ink-mute py-6">Loading availability…</div>
      ) : slots.length === 0 ? (
        <div className="text-[12px] text-ink-mute py-6">
          No availability today. Pick a different{' '}
          {profession.resourcePlural.toLowerCase().replace(/s$/, '')} or check back tomorrow.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {slots.map((s) => {
            const sel = selected?.start === s.start;
            return (
              <button
                key={s.start}
                type="button"
                onClick={() => selectSlot(s)}
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
      )}
    </div>
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
      {create.error && <div className="text-[12px] text-danger">{create.error.message}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-2 px-6 py-3 text-white text-sm font-medium disabled:opacity-50"
        style={{ background: theme.accent, borderRadius: theme.radius }}
      >
        {create.isPending
          ? 'Booking…'
          : selected
            ? `Confirm ${selected.displayTime}`
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
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mt-7 mb-3">
            {profession.resourcePlural}
          </div>
          {ResourcesList}
          <div className="border-t border-border my-7" />
          <div className="text-[12px] text-ink-mute leading-relaxed">
            {profession.slotLabel}s last <strong>{profession.slotDuration} minutes</strong>. Cancel
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
            <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
              Today · {timezone}
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
                {resource?.title ?? profession.name} · {profession.slotDuration} minutes
              </p>
            </div>
            <div className="p-8">
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                {profession.resourcePlural}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-7">
                {resources.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setResourceIdx(i);
                      setSelected(null);
                    }}
                    className="border rounded-lg px-3 py-2.5 text-left"
                    style={{
                      borderColor: i === resourceIdx ? theme.accent : 'var(--color-border)',
                      background: i === resourceIdx ? `${theme.accent}08` : 'var(--color-surface)',
                    }}
                  >
                    <div className="text-[13px] font-medium text-ink">{r.name}</div>
                    <div className="text-[11px] text-ink-mute">{r.title ?? ''}</div>
                  </button>
                ))}
              </div>
              {ServicePicker}
              <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
                Available slots · {timezone}
              </div>
              {SlotGrid}
              {CustomerForm}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inline week layout — uses the same per-day slot grid for the active resource.
  return (
    <div className="bg-bg p-10 min-h-[860px]" style={styleVars}>
      <div className="max-w-[1100px] mx-auto">
        <div className="flex justify-between items-start mb-8">
          {Header}
          <div className="text-[11px] text-ink-soft font-mono">{timezone}</div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-8">
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            {profession.resourcePlural}
          </div>
          {ResourcesList}
          <div className="mt-7" />
          {ServicePicker}
          <div className="text-[10px] uppercase tracking-wider text-ink-soft font-mono mb-3">
            Today
          </div>
          {SlotGrid}
          {CustomerForm}
        </div>
      </div>
    </div>
  );
}
