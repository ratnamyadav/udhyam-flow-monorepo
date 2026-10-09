import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { ResponsiveContent } from '@/components/responsive';
import { Chip, DateStrip, Field, HHMM, PrimaryButton, SectionLabel } from '@/components/scheduling';
import {
  addDays,
  formatDateTime,
  formatDay,
  formatTime,
  todayInTimeZone,
} from '../../../lib/format';
import { errorMessage, trpc } from '../../../lib/trpc';

// Holidays, leave and breaks. Blocked time disappears from the booking page;
// bookings already inside it stay put and are listed so they can be moved.
export default function TimeOffScreen() {
  const utils = trpc.useUtils();
  const list = trpc.timeOff.list.useQuery();
  const resources = trpc.resource.list.useQuery();
  const locations = trpc.location.list.useQuery();

  // "loc:<id>" = everyone at a location, "res:<id>" = one resource.
  const options = [
    ...(locations.data ?? []).map((l) => ({
      value: `loc:${l.id}`,
      label: (locations.data?.length ?? 0) > 1 ? `Everyone at ${l.name}` : 'Everyone',
      timezone: l.timezone,
    })),
    ...(resources.data ?? []).map((r) => ({
      value: `res:${r.id}`,
      label: r.name,
      timezone: locations.data?.find((l) => l.id === r.locationId)?.timezone,
    })),
  ];
  const [who, setWho] = useState<string | null>(null);
  const selected = options.find((o) => o.value === who) ?? options[0];
  const [startDate, setStartDate] = useState<string | null>(null);
  const [days, setDays] = useState(1);
  const [partDay, setPartDay] = useState(false);
  const [from, setFrom] = useState('13:00');
  const [to, setTo] = useState('14:00');
  const [reason, setReason] = useState('');

  const start = startDate ?? todayInTimeZone(selected?.timezone);
  const add = trpc.timeOff.add.useMutation({
    onSuccess: async (res) => {
      setReason('');
      await Promise.all([utils.timeOff.list.invalidate(), utils.booking.invalidate()]);
      if (res.conflicts.length) {
        Alert.alert(
          `${res.conflicts.length} booking${res.conflicts.length > 1 ? 's are' : ' is'} in this time`,
          `${res.conflicts
            .map((c) => `${c.customerName} · ${formatDateTime(c.slotStart, res.timezone)}`)
            .join('\n')}\n\nMove or cancel them from Bookings.`,
        );
      }
    },
  });
  const remove = trpc.timeOff.remove.useMutation({
    onSuccess: () => utils.timeOff.list.invalidate(),
  });

  const timesOk = !partDay || (HHMM.test(from) && HHMM.test(to) && from < to);
  const canSubmit = !!selected && timesOk && !add.isPending;

  function submit() {
    if (!selected) return;
    const [kind, id] = selected.value.split(':');
    add.mutate({
      locationId: kind === 'loc' ? id : undefined,
      resourceId: kind === 'res' ? id : undefined,
      startDate: start,
      endDate: partDay ? undefined : addDays(start, days - 1),
      startTime: partDay ? from : undefined,
      endTime: partDay ? to : undefined,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pt-2 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <ResponsiveContent variant="form">
        <SectionLabel>Upcoming</SectionLabel>
        <View className="bg-surface border border-border rounded-xl overflow-hidden">
          {list.isLoading ? (
            <Text className="text-sm text-ink-mute p-4">Loading…</Text>
          ) : list.error ? (
            <Text className="text-sm text-danger p-4">{errorMessage(list.error)}</Text>
          ) : !list.data?.length ? (
            <Text className="text-sm text-ink-mute p-4">Nothing blocked.</Text>
          ) : (
            list.data.map((t, i) => (
              <View
                key={t.id}
                className={`flex-row items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-ink">
                    {t.resourceName ?? `Everyone at ${t.locationName}`}
                  </Text>
                  <Text className="text-xs text-ink-mute">
                    {formatSpan(t.startsAt, t.endsAt, t.timezone)}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove time off for ${t.resourceName ?? t.locationName}`}
                  disabled={remove.isPending}
                  onPress={() =>
                    Alert.alert('Remove this time off?', 'The time becomes bookable again.', [
                      { text: 'Keep', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => remove.mutate({ id: t.id }),
                      },
                    ])
                  }
                  className="px-2 py-1"
                >
                  <Text className="text-xs text-danger">Remove</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text className="text-lg font-semibold text-ink mt-8">Block time</Text>

        <SectionLabel>Who</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          {options.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              on={o.value === selected?.value}
              onPress={() => setWho(o.value)}
            />
          ))}
        </View>

        <SectionLabel>From</SectionLabel>
        <DateStrip timezone={selected?.timezone} value={start} onChange={setStartDate} count={60} />

        <SectionLabel>How long</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          <Chip label="Whole days" on={!partDay} onPress={() => setPartDay(false)} />
          <Chip label="Part of the day" on={partDay} onPress={() => setPartDay(true)} />
        </View>
        {partDay ? (
          <View className="flex-row gap-3 mt-3">
            <View className="flex-1">
              <Field
                label="From"
                value={from}
                onChangeText={(t) => setFrom(t.trim())}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <View className="flex-1">
              <Field
                label="To"
                value={to}
                onChangeText={(t) => setTo(t.trim())}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>
        ) : (
          <View className="flex-row items-center gap-4 mt-3">
            <Stepper label="−" onPress={() => setDays((d) => Math.max(1, d - 1))} />
            <Text className="text-base text-ink">
              {days} day{days > 1 ? 's' : ''}
              {days > 1 ? ` · until ${addDays(start, days - 1)}` : ''}
            </Text>
            <Stepper label="+" onPress={() => setDays((d) => Math.min(60, d + 1))} />
          </View>
        )}

        <View className="mt-5">
          <Field
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Diwali, leave, lunch…"
            maxLength={200}
          />
        </View>

        {!timesOk ? (
          <Text className="text-sm text-danger mt-4">
            Use times like 13:00, with To after From.
          </Text>
        ) : null}
        {add.error ? (
          <Text className="text-sm text-danger mt-4">{errorMessage(add.error)}</Text>
        ) : null}
        <PrimaryButton
          label={add.isPending ? 'Saving…' : 'Block time'}
          disabled={!canSubmit}
          onPress={submit}
        />
      </ResponsiveContent>
    </ScrollView>
  );
}

// Whole days are stored midnight → midnight; show them as dates.
function formatSpan(start: Date, end: Date, tz: string) {
  const midnight = (d: Date) => /^(00|24):00$/.test(formatTime(d, tz));
  if (midnight(start) && midnight(end)) {
    const first = formatDay(start, tz);
    const last = formatDay(new Date(end.getTime() - 1), tz);
    return first === last ? `${first} · all day` : `${first} – ${last}`;
  }
  const sameDay = formatDay(start, tz) === formatDay(end, tz);
  return `${formatDateTime(start, tz)} – ${sameDay ? formatTime(end, tz) : formatDateTime(end, tz)}`;
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'One more day' : 'One day fewer'}
      className="w-10 h-10 rounded-md border border-border bg-surface items-center justify-center"
    >
      <Text className="text-lg text-ink">{label}</Text>
    </Pressable>
  );
}
