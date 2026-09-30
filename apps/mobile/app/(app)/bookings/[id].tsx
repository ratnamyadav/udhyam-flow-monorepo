import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ResponsiveContent } from '../../../components/responsive';
import { trpc } from '../../../lib/trpc';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  // We lean on booking.list to find the row — listing-then-filter avoids
  // adding a dedicated booking.get procedure for just this screen.
  const list = trpc.booking.list.useQuery({ limit: 200 });
  const booking = list.data?.find((b) => b.id === id);

  const cancel = trpc.booking.cancel.useMutation({
    onSuccess: () => {
      utils.booking.invalidate();
      router.back();
    },
  });
  const noShow = trpc.booking.markNoShow.useMutation({
    onSuccess: () => utils.booking.invalidate(),
  });
  const complete = trpc.booking.markComplete.useMutation({
    onSuccess: () => utils.booking.invalidate(),
  });

  if (list.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <Text className="text-sm text-ink-mute">Loading…</Text>
      </View>
    );
  }
  if (!booking) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-sm text-ink-mute">Booking not found.</Text>
      </View>
    );
  }

  const isFuture = booking.slotStart > new Date();
  const isConfirmed = booking.status === 'confirmed';

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-16 pb-12">
      <ResponsiveContent>
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">
          Booking · {booking.id.slice(-6).toUpperCase()}
        </Text>
        <Text className="text-3xl font-semibold text-ink mt-1">{booking.customerName}</Text>
        <Text className="text-sm text-ink-mute mt-1">
          {booking.customerEmail ?? booking.customerPhone ?? '—'}
        </Text>

        <View className="bg-surface border border-border rounded-xl p-4 mt-7">
          <Row label="When" value={booking.slotStart.toLocaleString()} />
          <Row label="Status" value={booking.status} />
          <Row label="Payment" value={booking.paymentStatus} />
        </View>

        {isConfirmed && (
          <View className="mt-6 gap-2">
            {isFuture ? (
              <Pressable
                onPress={() => cancel.mutate({ id: booking.id })}
                className="bg-surface border border-border rounded-md py-3.5 active:opacity-90"
              >
                <Text className="text-ink text-center font-medium">Cancel booking</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => complete.mutate({ id: booking.id })}
                  className="bg-ink rounded-md py-3.5 active:opacity-90"
                >
                  <Text className="text-bg text-center font-medium">Mark complete</Text>
                </Pressable>
                <Pressable
                  onPress={() => noShow.mutate({ id: booking.id })}
                  className="bg-surface border border-border rounded-md py-3.5 active:opacity-90"
                >
                  <Text className="text-ink text-center font-medium">Mark no-show</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ResponsiveContent>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-xs uppercase tracking-wider text-ink-mute font-mono">{label}</Text>
      <Text className="text-sm text-ink">{value}</Text>
    </View>
  );
}
