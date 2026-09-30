import { Link } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/lib/auth';
import { calendarDateParts, formatTime, statusLabel } from '../../lib/format';
import { errorMessage, trpc } from '../../lib/trpc';

export default function DashboardScreen() {
  const { data: session } = useSession();
  const me = trpc.auth.me.useQuery();
  // { timezone, date, bookings } — the day window is computed server-side in
  // the (first) location's timezone, so times render in that timezone too.
  const today = trpc.booking.listToday.useQuery();
  const locations = trpc.location.list.useQuery();
  const resources = trpc.resource.list.useQuery();

  // Drift probe: if useSession() shows a user but tRPC's auth.me returns
  // null, the Cookie header plumbing has regressed. Log loud so we notice.
  useEffect(() => {
    if (session?.user && me.isFetched && !me.data) {
      console.warn(
        '[udyamflow] tRPC sees no session even though useSession() does. Cookie plumbing may be broken.',
      );
    }
  }, [session?.user, me.isFetched, me.data]);

  const first = session?.user.name?.split(' ')[0] ?? 'there';
  const bookings = today.data?.bookings ?? [];
  const tz = today.data?.timezone;
  const day = today.data ? calendarDateParts(today.data.date) : null;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pt-16 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={today.isRefetching}
          onRefresh={() => {
            void today.refetch();
            void locations.refetch();
            void resources.refetch();
          }}
        />
      }
    >
      <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">
        {locations.data?.[0]?.name ?? 'Loading…'}
      </Text>
      <Text className="text-3xl font-semibold text-ink mt-1">Good day, {first}</Text>

      <View className="flex-row gap-2 mt-7">
        <Metric label="Today" value={String(bookings.length)} />
        <Metric label="Resources" value={String(resources.data?.length ?? 0)} />
        <Metric label="Locations" value={String(locations.data?.length ?? 0)} />
      </View>

      <Text className="text-xs uppercase tracking-wider text-ink-mute font-mono mt-9 mb-3">
        Today's bookings
        {day ? ` · ${day.weekday} ${day.day} ${day.month}` : ''}
        {tz ? ` · ${tz}` : ''}
      </Text>
      {today.isLoading ? (
        <Text className="text-sm text-ink-mute">Loading…</Text>
      ) : today.error ? (
        <Text className="text-sm text-danger">{errorMessage(today.error)}</Text>
      ) : bookings.length === 0 ? (
        <View className="bg-surface border border-border rounded-xl p-6">
          <Text className="text-sm text-ink">No bookings today.</Text>
          <Text className="text-xs text-ink-mute mt-1">
            Share your booking page to start filling slots.
          </Text>
        </View>
      ) : (
        <View className="bg-surface border border-border rounded-xl overflow-hidden">
          {bookings.map((b, i) => (
            <Link key={b.id} href={`/bookings/${b.id}`} asChild>
              <Pressable className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                <Text className="text-sm font-medium text-ink">{b.customerName}</Text>
                <Text className="text-xs text-ink-mute font-mono">
                  {formatTime(b.slotStart, tz)}
                  {' · '}
                  {statusLabel(b.status)}
                </Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-xl p-4">
      <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono">{label}</Text>
      <Text className="text-2xl font-semibold text-ink mt-1 font-mono">{value}</Text>
    </View>
  );
}
