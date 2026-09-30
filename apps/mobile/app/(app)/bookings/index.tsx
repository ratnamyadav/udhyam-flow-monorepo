import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ResponsiveContent } from '../../../components/responsive';
import { trpc } from '../../../lib/trpc';

export default function BookingsListScreen() {
  const list = trpc.booking.list.useQuery({ limit: 100 });
  const bookings = list.data ?? [];

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-16 pb-12">
      <ResponsiveContent>
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">Bookings</Text>
        <Text className="text-3xl font-semibold text-ink mt-1">All bookings</Text>

        <View className="bg-surface border border-border rounded-xl overflow-hidden mt-7">
          {list.isLoading ? (
            <Text className="text-sm text-ink-mute p-6">Loading…</Text>
          ) : bookings.length === 0 ? (
            <Text className="text-sm text-ink-mute p-6">No bookings yet.</Text>
          ) : (
            bookings.map((b, i) => (
              <Link key={b.id} href={`/bookings/${b.id}`} asChild>
                <Pressable className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <Text className="text-sm font-medium text-ink">{b.customerName}</Text>
                  <Text className="text-xs text-ink-mute font-mono">
                    {new Date(b.slotStart).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                    {' · '}
                    {b.status}
                  </Text>
                </Pressable>
              </Link>
            ))
          )}
        </View>
      </ResponsiveContent>
    </ScrollView>
  );
}
