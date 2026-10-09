import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { ResponsiveContent } from '@/components/responsive';
import { DateStrip, HHMM, PrimaryButton, SectionLabel, TimePicker } from '@/components/scheduling';
import { formatDateTime, todayInTimeZone } from '../../../lib/format';
import { errorMessage, trpc } from '../../../lib/trpc';

// Move a confirmed booking to another day/time, keeping its length and price.
export default function MoveBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const query = trpc.booking.get.useQuery({ id }, { enabled: !!id });
  const booking = query.data;
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [notify, setNotify] = useState(true);

  const move = trpc.booking.reschedule.useMutation({
    onSuccess: async () => {
      await utils.booking.invalidate();
      router.back();
    },
  });

  if (!booking) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-sm text-ink-mute text-center">
          {query.error ? errorMessage(query.error) : 'Loading…'}
        </Text>
      </View>
    );
  }

  const day = date ?? todayInTimeZone(booking.timezone);
  const validTime = HHMM.test(time);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pt-2 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <ResponsiveContent variant="form">
        <Text className="text-2xl font-semibold text-ink">{booking.customerName}</Text>
        <Text className="text-sm text-ink-mute mt-1">
          Now: {formatDateTime(booking.slotStart, booking.timezone)} with {booking.resourceName}
        </Text>

        <SectionLabel>New date</SectionLabel>
        <DateStrip
          timezone={booking.timezone}
          value={day}
          onChange={(d) => {
            setDate(d);
            setTime('');
          }}
        />

        <SectionLabel>{`New time · ${booking.timezone}`}</SectionLabel>
        <TimePicker
          resourceId={booking.resourceId}
          serviceId={booking.serviceId ?? undefined}
          date={day}
          value={time}
          onChange={(t) => {
            setTime(t);
            move.reset();
          }}
        />

        <View className="flex-row items-center justify-between mt-5">
          <Text className="text-sm text-ink flex-1 pr-4">Tell the customer</Text>
          <Switch value={notify} onValueChange={setNotify} accessibilityLabel="Notify customer" />
        </View>

        {move.error ? (
          <Text className="text-sm text-danger mt-4">{errorMessage(move.error)}</Text>
        ) : null}
        <PrimaryButton
          label={move.isPending ? 'Moving…' : validTime ? `Move to ${time}` : 'Pick a time'}
          disabled={!validTime || move.isPending}
          onPress={() => move.mutate({ id: booking.id, date: day, time, notifyCustomer: notify })}
        />
      </ResponsiveContent>
    </ScrollView>
  );
}
