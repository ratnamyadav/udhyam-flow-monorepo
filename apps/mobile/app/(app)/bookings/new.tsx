import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { ResponsiveContent } from '@/components/responsive';
import {
  Chip,
  DateStrip,
  Field,
  HHMM,
  PrimaryButton,
  SectionLabel,
  TimePicker,
} from '@/components/scheduling';
import { todayInTimeZone } from '../../../lib/format';
import { errorMessage, trpc } from '../../../lib/trpc';

// Walk-ins and phone bookings. Confirmed straight away; any payment is
// collected at the venue.
export default function NewBookingScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const resources = trpc.resource.list.useQuery();
  const services = trpc.service.list.useQuery();
  const locations = trpc.location.list.useQuery();

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notify, setNotify] = useState(true);

  const service = services.data?.find((s) => s.id === serviceId);
  // A service with no linked resources is offered by everyone.
  const eligible = (resources.data ?? []).filter(
    (r) => !service || service.resourceIds.length === 0 || service.resourceIds.includes(r.id),
  );
  const resource = eligible.find((r) => r.id === resourceId) ?? eligible[0];
  const timezone = locations.data?.find((l) => l.id === resource?.locationId)?.timezone;
  const day = date ?? todayInTimeZone(timezone);

  const create = trpc.booking.createByStaff.useMutation({
    onSuccess: async (res) => {
      await utils.booking.invalidate();
      router.replace({ pathname: '/bookings/[id]', params: { id: res.id } });
    },
  });

  if (resources.isLoading || services.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <Text className="text-sm text-ink-mute">Loading…</Text>
      </View>
    );
  }
  if (!resources.data?.length) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-8">
        <Text className="text-sm text-ink-mute text-center">
          {resources.error
            ? errorMessage(resources.error)
            : 'Add a staff member or resource in the web app first.'}
        </Text>
      </View>
    );
  }

  const validTime = HHMM.test(time);
  const canSubmit = !!resource && validTime && name.trim().length >= 2 && !create.isPending;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pt-2 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <ResponsiveContent variant="form">
        {services.data?.length ? (
          <>
            <SectionLabel>Service</SectionLabel>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label="No specific service"
                on={!service}
                onPress={() => {
                  setServiceId(null);
                  setTime('');
                }}
              />
              {services.data.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  sub={`${s.durationMin} min`}
                  on={s.id === service?.id}
                  onPress={() => {
                    setServiceId(s.id);
                    setTime('');
                  }}
                />
              ))}
            </View>
          </>
        ) : null}

        <SectionLabel>With</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          {eligible.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              sub={r.title ?? undefined}
              on={r.id === resource?.id}
              onPress={() => {
                setResourceId(r.id);
                setTime('');
              }}
            />
          ))}
        </View>

        <SectionLabel>Date</SectionLabel>
        <DateStrip
          timezone={timezone}
          value={day}
          onChange={(d) => {
            setDate(d);
            setTime('');
          }}
        />

        <SectionLabel>{timezone ? `Time · ${timezone}` : 'Time'}</SectionLabel>
        {resource ? (
          <TimePicker
            resourceId={resource.id}
            serviceId={service?.id}
            date={day}
            value={time}
            onChange={(t) => {
              setTime(t);
              create.reset();
            }}
          />
        ) : null}

        <SectionLabel>Customer</SectionLabel>
        <View className="gap-3">
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            autoCapitalize="words"
          />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="optional"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="optional"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </View>

        <View className="flex-row items-center justify-between mt-5">
          <Text className="text-sm text-ink flex-1 pr-4">Send the customer a confirmation</Text>
          <Switch value={notify} onValueChange={setNotify} accessibilityLabel="Notify customer" />
        </View>

        {create.error ? (
          <Text className="text-sm text-danger mt-4">{errorMessage(create.error)}</Text>
        ) : null}
        <PrimaryButton
          label={
            create.isPending
              ? 'Booking…'
              : validTime
                ? `Book at ${time}`
                : time
                  ? 'Use a time like 14:30'
                  : 'Pick a time'
          }
          disabled={!canSubmit}
          onPress={() => {
            if (!resource) return;
            create.mutate({
              resourceId: resource.id,
              serviceId: service?.id,
              date: day,
              time,
              customerName: name.trim(),
              customerPhone: phone.trim() || undefined,
              customerEmail: email.trim() || undefined,
              notifyCustomer: notify,
            });
          }}
        />
      </ResponsiveContent>
    </ScrollView>
  );
}
