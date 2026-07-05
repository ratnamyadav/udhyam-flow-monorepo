import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { trpc } from '../../lib/trpc';

// Per-tenant booking surface — resource picker, slot grid, customer form.
// Calls the same public `booking.listSlots` + `booking.create` procedures
// the web flow uses.

type Slot = { start: string; end: string; displayTime: string };

export default function BookTenantScreen() {
  const router = useRouter();
  const { orgSlug } = useLocalSearchParams<{ orgSlug: string }>();

  const resources = trpc.resource.listForTenant.useQuery({ orgSlug });
  const services = trpc.service.listForTenant.useQuery({ orgSlug });

  const [resourceId, setResourceId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // First resource auto-selected so the slot grid loads.
  const effectiveResource = resourceId ?? resources.data?.[0]?.id ?? null;
  const slotsQuery = trpc.booking.listSlots.useQuery(
    {
      orgSlug,
      locationId: resources.data?.find((r) => r.id === effectiveResource)?.locationId ?? '',
      resourceId: effectiveResource ?? '',
      serviceId,
    },
    { enabled: !!effectiveResource },
  );
  const slots: Slot[] = slotsQuery.data?.slots ?? [];
  const timezone = slotsQuery.data?.timezone ?? 'UTC';

  const create = trpc.booking.create.useMutation({
    onSuccess: (res) => {
      router.replace(`/book/${orgSlug}/confirmation?booking=${res.id}&ref=${res.referenceCode}`);
    },
  });

  function submit() {
    if (!effectiveResource || !selected) return;
    const loc = resources.data?.find((r) => r.id === effectiveResource)?.locationId;
    if (!loc) return;
    create.mutate({
      orgSlug,
      resourceId: effectiveResource,
      locationId: loc,
      serviceId,
      customerName: name.trim(),
      customerEmail: email.trim() || undefined,
      customerPhone: phone.trim() || undefined,
      slotStart: selected.start,
      slotEnd: selected.end,
    });
  }

  if (resources.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <Text className="text-sm text-ink-mute">Loading…</Text>
      </View>
    );
  }
  if (!resources.data || resources.data.length === 0) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-8">
        <Text className="text-base text-ink text-center">
          No resources are bookable on this workspace yet.
        </Text>
      </View>
    );
  }

  const canSubmit = !!selected && name.trim().length >= 2 && !create.isPending;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-16 pb-16">
      <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">/{orgSlug}</Text>
      <Text className="text-3xl font-semibold text-ink mt-1">Pick a slot</Text>

      <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono mt-6 mb-2">
        Who do you want to see?
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {resources.data.map((r) => {
          const on = (effectiveResource ?? '') === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => {
                setResourceId(r.id);
                setSelected(null);
              }}
              className={`px-3 py-2 rounded-md border ${on ? 'border-ink' : 'border-border'}`}
            >
              <Text className={`text-[13px] ${on ? 'text-ink' : 'text-ink-mute'}`}>{r.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {services.data && services.data.length > 0 && (
        <>
          <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono mt-6 mb-2">
            Service
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {services.data.map((s) => {
              const on = serviceId === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setServiceId(s.id);
                    setSelected(null);
                  }}
                  className={`px-3 py-2 rounded-md border ${on ? 'border-ink' : 'border-border'}`}
                >
                  <Text className={`text-[13px] ${on ? 'text-ink' : 'text-ink-mute'}`}>
                    {s.name} · {s.durationMin}min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono mt-6 mb-2">
        Today · {timezone}
      </Text>
      {slotsQuery.isLoading ? (
        <Text className="text-sm text-ink-mute py-3">Loading availability…</Text>
      ) : slots.length === 0 ? (
        <Text className="text-sm text-ink-mute py-3">
          No slots today. Try a different resource or check back tomorrow.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {slots.map((s) => {
            const on = selected?.start === s.start;
            return (
              <Pressable
                key={s.start}
                onPress={() => setSelected(s)}
                className={`px-3 py-2 rounded-md border ${on ? 'bg-ink border-ink' : 'border-border'}`}
              >
                <Text className={`text-[13px] font-mono ${on ? 'text-bg' : 'text-ink'}`}>
                  {s.displayTime}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono mt-8 mb-2">
        Your details
      </Text>
      <View className="gap-3">
        <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="optional" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="optional" />
      </View>

      {create.error && <Text className="text-[12px] text-danger mt-3">{create.error.message}</Text>}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        className={`mt-6 rounded-md py-3.5 ${canSubmit ? 'bg-ink' : 'bg-surface-mute'}`}
      >
        <Text className={`text-center font-medium ${canSubmit ? 'text-bg' : 'text-ink-mute'}`}>
          {create.isPending
            ? 'Booking…'
            : selected
              ? `Confirm ${selected.displayTime}`
              : 'Pick a slot'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View>
      <Text className="text-[11px] uppercase tracking-wider text-ink-mute font-mono mb-1">
        {label}
      </Text>
      <TextInput
        autoCapitalize="words"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        className="text-base text-ink bg-surface border border-border rounded-md px-3 py-2"
      />
    </View>
  );
}
