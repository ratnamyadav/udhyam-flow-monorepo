import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ResponsiveContent } from '@/components/responsive';
import { formatDateTime, statusLabel } from '../../../lib/format';
import { errorMessage, trpc } from '../../../lib/trpc';

const PAGE_SIZE = 50;

export default function BookingsListScreen() {
  // booking.list is sorted by slotStart DESC with offset pagination. Each page
  // is its own cached query so "Load more" keeps earlier pages and a refresh
  // (or invalidation after a mutation) refetches every loaded page.
  const [pageCount, setPageCount] = useState(1);
  const pages = trpc.useQueries((t) =>
    Array.from({ length: pageCount }, (_, i) =>
      t.booking.list({ limit: PAGE_SIZE, offset: i * PAGE_SIZE }),
    ),
  );
  const locations = trpc.location.list.useQuery();
  const tzByLocation = useMemo(
    () => new Map((locations.data ?? []).map((l) => [l.id, l.timezone])),
    [locations.data],
  );

  const bookings = pages.flatMap((p) => p.data ?? []);
  const last = pages[pages.length - 1];
  const firstLoading = pages[0]?.isLoading ?? true;
  const loadingMore = pageCount > 1 && !!last?.isLoading;
  const hasMore = !!last?.data && last.data.length === PAGE_SIZE;
  const error = pages.find((p) => p.error)?.error;
  const refreshing = pages.some((p) => p.isRefetching);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pt-16 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            for (const p of pages) void p.refetch();
          }}
        />
      }
    >
      <ResponsiveContent>
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">Bookings</Text>
        <Text className="text-3xl font-semibold text-ink mt-1">All bookings</Text>

        <View className="bg-surface border border-border rounded-xl overflow-hidden mt-7">
          {firstLoading ? (
            <Text className="text-sm text-ink-mute p-6">Loading…</Text>
          ) : bookings.length === 0 ? (
            <Text className="text-sm text-ink-mute p-6">
              {error ? errorMessage(error) : 'No bookings yet.'}
            </Text>
          ) : (
            bookings.map((b, i) => (
              <Link key={b.id} href={`/bookings/${b.id}`} asChild>
                <Pressable className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <Text className="text-sm font-medium text-ink">{b.customerName}</Text>
                  <Text className="text-xs text-ink-mute font-mono">
                    {formatDateTime(b.slotStart, tzByLocation.get(b.locationId))}
                    {' · '}
                    {statusLabel(b.status)}
                  </Text>
                </Pressable>
              </Link>
            ))
          )}
        </View>

        {error && bookings.length > 0 ? (
          <Text className="text-sm text-danger mt-3">{errorMessage(error)}</Text>
        ) : null}

        {hasMore || loadingMore ? (
          <Pressable
            onPress={() => setPageCount((n) => n + 1)}
            disabled={loadingMore}
            className="mt-4 bg-surface border border-border rounded-md py-3 active:opacity-90"
          >
            <Text className="text-ink text-center font-medium">
              {loadingMore ? 'Loading…' : 'Load more'}
            </Text>
          </Pressable>
        ) : null}
      </ResponsiveContent>
    </ScrollView>
  );
}
