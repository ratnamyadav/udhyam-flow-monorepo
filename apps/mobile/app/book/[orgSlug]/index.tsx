import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, type TextInputProps, View } from 'react-native';
import { type BrandColors, BrandHeader, useTenantBranding } from '../../../lib/branding';
import { addDays, calendarDateParts, formatMoney, todayInTimeZone } from '../../../lib/format';
import { errorMessage, trpc, trpcErrorCode } from '../../../lib/trpc';

// Per-tenant booking surface — location / resource / service / date pickers,
// slot grid, customer form. Calls the same public procedures the web flow
// uses; paid services hand off to the hosted checkout in an in-app browser.

type Slot = { start: string; end: string; displayTime: string };

const BOOKABLE_DAYS = 14;

export default function BookTenantScreen() {
  const router = useRouter();
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();

  const locations = trpc.location.listForTenant.useQuery({ orgSlug });
  const resources = trpc.resource.listForTenant.useQuery({ orgSlug });
  const services = trpc.service.listForTenant.useQuery({ orgSlug });
  const { branding, colors } = useTenantBranding(orgSlug);

  const [locationId, setLocationId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  // --- Derived selection (falls back to the first valid option) -------------
  const locationList = locations.data ?? [];
  const resourceList = resources.data ?? [];
  const location =
    locationList.find((l) => l.id === locationId) ??
    locationList.find((l) => resourceList.some((r) => r.locationId === l.id)) ??
    locationList[0];
  const effectiveLocationId = location?.id ?? resourceList[0]?.locationId;
  const timezone = location?.timezone;

  const resourcesHere = resourceList.filter((r) => r.locationId === effectiveLocationId);
  const resource = resourcesHere.find((r) => r.id === resourceId) ?? resourcesHere[0];

  // Empty `resourceIds` = offered by every resource.
  const eligibleServices = (services.data ?? []).filter(
    (s) => !resource || s.resourceIds.length === 0 || s.resourceIds.includes(resource.id),
  );
  const serviceRequired = eligibleServices.length > 0;
  const service =
    eligibleServices.find((s) => s.id === serviceId) ??
    (eligibleServices.length === 1 ? eligibleServices[0] : undefined);

  const today = todayInTimeZone(timezone);
  const days = useMemo(
    () => Array.from({ length: BOOKABLE_DAYS }, (_, i) => addDays(today, i)),
    [today],
  );
  const effectiveDate = date && days.includes(date) ? date : today;

  const slotsEnabled = !!effectiveLocationId && !!resource && (!serviceRequired || !!service);
  const slotsQuery = trpc.booking.listSlots.useQuery(
    {
      orgSlug,
      locationId: effectiveLocationId ?? '',
      resourceId: resource?.id ?? '',
      serviceId: service?.id,
      date: effectiveDate,
    },
    { enabled: slotsEnabled },
  );
  const slots: Slot[] = slotsQuery.data?.slots ?? [];
  const slotsTimezone = slotsQuery.data?.timezone ?? timezone ?? '';

  // --- Mutations ------------------------------------------------------------
  const createCheckout = trpc.payment.createCheckout.useMutation();
  const create = trpc.booking.create.useMutation({
    onSuccess: async (res) => {
      const confirmation = `/book/${orgSlug}/confirmation?booking=${encodeURIComponent(
        res.id,
      )}&ref=${encodeURIComponent(res.referenceCode)}`;
      if (res.requiresPayment) {
        setRedirecting(true);
        try {
          const { redirectUrl } = await createCheckout.mutateAsync({ bookingId: res.id });
          await WebBrowser.openBrowserAsync(redirectUrl);
        } catch {
          // The confirmation screen shows the pending state and can retry
          // opening the checkout while the hold is still valid.
        } finally {
          setRedirecting(false);
        }
      }
      router.replace(confirmation);
    },
    onError: (err) => {
      if (trpcErrorCode(err) === 'CONFLICT') {
        // Someone else took the slot — refresh availability.
        setSelected(null);
        void slotsQuery.refetch();
      }
    },
  });

  function resetSlot() {
    setSelected(null);
    create.reset();
  }

  function submit() {
    if (!effectiveLocationId || !resource || !selected) return;
    create.mutate({
      orgSlug,
      resourceId: resource.id,
      locationId: effectiveLocationId,
      serviceId: service?.id,
      customerName: name.trim(),
      customerEmail: email.trim() || undefined,
      customerPhone: phone.trim() || undefined,
      slotStart: selected.start,
    });
  }

  // --- Render ---------------------------------------------------------------
  if (resources.isLoading || locations.isLoading || services.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <Text className="text-sm text-ink-mute">Loading…</Text>
      </View>
    );
  }
  if (resourceList.length === 0) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-8">
        <Text className="text-base text-ink text-center">
          {resources.error
            ? errorMessage(resources.error)
            : 'No resources are bookable on this workspace yet.'}
        </Text>
        <Pressable
          onPress={() => router.replace('/book')}
          className="mt-6 px-5 py-2.5 bg-surface border border-border rounded-md"
        >
          <Text className="text-ink font-medium">Try another code</Text>
        </Pressable>
      </View>
    );
  }

  const busy = create.isPending || redirecting;
  const canSubmit =
    !!selected && name.trim().length >= 2 && (!serviceRequired || !!service) && !busy;
  const dayLabel = calendarDateParts(effectiveDate);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pt-16 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      {branding ? (
        <BrandHeader branding={branding} colors={colors} />
      ) : (
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">/{orgSlug}</Text>
      )}
      <Text className="text-3xl font-semibold text-ink mt-4" accessibilityRole="header">
        {branding?.bookingHeadline?.trim() || 'Pick a slot'}
      </Text>
      {branding?.bookingIntro?.trim() ? (
        <Text className="text-sm text-ink-mute mt-2 leading-relaxed">
          {branding.bookingIntro.trim()}
        </Text>
      ) : null}

      {locationList.length > 1 ? (
        <>
          <SectionLabel>Location</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {locationList.map((l) => (
              <Chip
                key={l.id}
                colors={colors}
                on={l.id === effectiveLocationId}
                label={l.name}
                sub={l.address ?? undefined}
                onPress={() => {
                  setLocationId(l.id);
                  setResourceId(null);
                  setServiceId(null);
                  setDate(null);
                  resetSlot();
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>Who do you want to see?</SectionLabel>
      {resourcesHere.length === 0 ? (
        <Text className="text-sm text-ink-mute">No one is bookable at this location yet.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {resourcesHere.map((r) => (
            <Chip
              key={r.id}
              colors={colors}
              on={r.id === resource?.id}
              label={r.name}
              sub={r.title ?? undefined}
              onPress={() => {
                setResourceId(r.id);
                resetSlot();
              }}
            />
          ))}
        </View>
      )}

      {serviceRequired ? (
        <>
          <SectionLabel>Service</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {eligibleServices.map((s) => (
              <Chip
                key={s.id}
                colors={colors}
                on={s.id === service?.id}
                label={`${s.name} · ${s.durationMin}min`}
                sub={s.priceCents > 0 ? formatMoney(s.priceCents, s.currency) : undefined}
                onPress={() => {
                  setServiceId(s.id);
                  resetSlot();
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel>Date</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6">
        <View className="flex-row gap-2 px-6">
          {days.map((d, i) => {
            const on = d === effectiveDate;
            const parts = calendarDateParts(d);
            return (
              <Pressable
                key={d}
                onPress={() => {
                  setDate(d);
                  resetSlot();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${i === 0 ? 'Today, ' : ''}${parts.weekday} ${parts.day} ${parts.month}`}
                className={`w-14 items-center py-2 border ${on ? '' : 'bg-surface border-border'}`}
                style={[{ borderRadius: colors.radius }, on ? selectedStyle(colors) : null]}
              >
                <Text
                  className={`text-[10px] uppercase font-mono ${on ? '' : 'text-ink-mute'}`}
                  style={on ? { color: colors.accentFg } : undefined}
                >
                  {i === 0 ? 'Today' : parts.weekday}
                </Text>
                <Text
                  className={`text-lg font-semibold ${on ? '' : 'text-ink'}`}
                  style={on ? { color: colors.accentFg } : undefined}
                >
                  {parts.day}
                </Text>
                <Text
                  className={`text-[10px] ${on ? '' : 'text-ink-mute'}`}
                  style={on ? { color: colors.accentFg } : undefined}
                >
                  {parts.month}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <SectionLabel>
        {`${dayLabel.weekday} ${dayLabel.day} ${dayLabel.month}`}
        {slotsTimezone ? ` · ${slotsTimezone}` : ''}
      </SectionLabel>
      {serviceRequired && !service ? (
        <Text className="text-sm text-ink-mute py-3">Choose a service to see available times.</Text>
      ) : slotsQuery.isLoading ? (
        <Text className="text-sm text-ink-mute py-3">Loading availability…</Text>
      ) : slotsQuery.error ? (
        <Text className="text-sm text-danger py-3">{errorMessage(slotsQuery.error)}</Text>
      ) : slots.length === 0 ? (
        <Text className="text-sm text-ink-mute py-3">
          No free slots on this day. Try another date or person.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {slots.map((s) => {
            const on = selected?.start === s.start;
            return (
              <Pressable
                key={s.start}
                onPress={() => {
                  setSelected(s);
                  create.reset();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${dayLabel.weekday} ${dayLabel.day} ${dayLabel.month} at ${s.displayTime}`}
                className={`px-3 py-2 border ${on ? '' : 'border-border'}`}
                style={[{ borderRadius: colors.radius }, on ? selectedStyle(colors) : null]}
              >
                <Text
                  className={`text-[13px] font-mono ${on ? '' : 'text-ink'}`}
                  style={on ? { color: colors.accentFg } : undefined}
                >
                  {s.displayTime}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <SectionLabel>Your details</SectionLabel>
      <View className="gap-3">
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="optional"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="optional"
          autoComplete="tel"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </View>

      {create.error ? (
        <Text className="text-[12px] text-danger mt-3">{errorMessage(create.error)}</Text>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className={`mt-6 py-3.5 ${canSubmit ? '' : 'bg-surface-mute'}`}
        style={[
          { borderRadius: colors.radius },
          canSubmit ? { backgroundColor: colors.accent } : null,
        ]}
      >
        <Text
          className={`text-center font-medium ${canSubmit ? '' : 'text-ink-mute'}`}
          style={canSubmit ? { color: colors.accentFg } : undefined}
        >
          {redirecting
            ? 'Opening payment…'
            : create.isPending
              ? 'Booking…'
              : selected
                ? `Confirm ${selected.displayTime}`
                : 'Pick a slot'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono mt-6 mb-2">
      {children}
    </Text>
  );
}

// Selected chip / date / slot: accent background with readable text.
function selectedStyle(colors: BrandColors) {
  return { backgroundColor: colors.accent, borderColor: colors.accent };
}

function Chip({
  label,
  sub,
  on,
  onPress,
  colors,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onPress: () => void;
  colors: BrandColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`px-3 py-2 border ${on ? '' : 'border-border'}`}
      style={[{ borderRadius: colors.radius }, on ? selectedStyle(colors) : null]}
    >
      <Text
        className={`text-[13px] ${on ? 'font-medium' : 'text-ink-mute'}`}
        style={on ? { color: colors.accentFg } : undefined}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          className={`text-[11px] mt-0.5 ${on ? '' : 'text-ink-soft'}`}
          style={on ? { color: colors.accentFg, opacity: 0.85 } : undefined}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View>
      <Text className="text-[11px] uppercase tracking-wider text-ink-mute font-mono mb-1">
        {label}
      </Text>
      <TextInput
        {...input}
        className="text-base text-ink bg-surface border border-border rounded-md px-3 py-2"
      />
    </View>
  );
}
