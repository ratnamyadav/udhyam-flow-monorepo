import { type ReactNode, useMemo } from 'react';
import { Pressable, ScrollView, Text, TextInput, type TextInputProps, View } from 'react-native';
import { addDays, calendarDateParts, todayInTimeZone } from '../lib/format';
import { errorMessage, trpc } from '../lib/trpc';

// Building blocks for the staff scheduling screens (new booking, move, time
// off). Dates are "YYYY-MM-DD" and times "HH:mm" in the location's timezone —
// the server converts, so nothing here does timezone math.

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono mt-6 mb-2">
      {children}
    </Text>
  );
}

export function Chip(props: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.on }}
      className={`px-3 py-2 rounded-md border ${props.on ? 'bg-ink border-ink' : 'border-border bg-surface'}`}
    >
      <Text className={`text-[13px] ${props.on ? 'text-bg font-medium' : 'text-ink'}`}>
        {props.label}
      </Text>
      {props.sub ? (
        <Text className={`text-[11px] mt-0.5 ${props.on ? 'text-bg' : 'text-ink-mute'}`}>
          {props.sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View>
      <Text className="text-[11px] uppercase tracking-wider text-ink-mute font-mono mb-1">
        {label}
      </Text>
      <TextInput
        placeholderTextColor="#9a978f"
        {...input}
        className="text-base text-ink bg-surface border border-border rounded-md px-3 py-2"
      />
    </View>
  );
}

export function PrimaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      // `active:` stays on even when disabled: NativeWind re-mounts a
      // Pressable whose pressed-state classes come and go.
      className={`mt-6 py-3.5 rounded-md active:opacity-90 ${props.disabled ? 'bg-surface-mute' : 'bg-ink'}`}
    >
      <Text className={`text-center font-medium ${props.disabled ? 'text-ink-mute' : 'text-bg'}`}>
        {props.label}
      </Text>
    </Pressable>
  );
}

// The next `count` days starting today in `timezone`, as tappable cards.
export function DateStrip(props: {
  timezone?: string;
  value: string;
  onChange: (date: string) => void;
  count?: number;
}) {
  const today = todayInTimeZone(props.timezone);
  const days = useMemo(
    () => Array.from({ length: props.count ?? 21 }, (_, i) => addDays(today, i)),
    [today, props.count],
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6">
      <View className="flex-row gap-2 px-6">
        {days.map((d, i) => {
          const on = d === props.value;
          const parts = calendarDateParts(d);
          return (
            <Pressable
              key={d}
              onPress={() => props.onChange(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${i === 0 ? 'Today, ' : ''}${parts.weekday} ${parts.day} ${parts.month}`}
              className={`w-14 items-center py-2 rounded-md border ${on ? 'bg-ink border-ink' : 'bg-surface border-border'}`}
            >
              <Text
                className={`text-[10px] uppercase font-mono ${on ? 'text-bg' : 'text-ink-mute'}`}
              >
                {i === 0 ? 'Today' : parts.weekday}
              </Text>
              <Text className={`text-lg font-semibold ${on ? 'text-bg' : 'text-ink'}`}>
                {parts.day}
              </Text>
              <Text className={`text-[10px] ${on ? 'text-bg' : 'text-ink-mute'}`}>
                {parts.month}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// Free times for one resource on a date, plus "other time": staff may book
// off the grid or outside hours as long as nothing overlaps (the server
// checks and explains if it does).
export function TimePicker(props: {
  resourceId: string;
  serviceId?: string;
  date: string;
  value: string;
  onChange: (hhmm: string) => void;
}) {
  const open = trpc.booking.openSlots.useQuery({
    date: props.date,
    resourceId: props.resourceId,
    serviceId: props.serviceId,
  });
  const slots = open.data?.resources[0]?.slots ?? [];
  const onGrid = slots.some((s) => s.displayTime === props.value);
  return (
    <View>
      {open.isLoading ? (
        <Text className="text-sm text-ink-mute py-2">Loading free times…</Text>
      ) : open.error ? (
        <Text className="text-sm text-danger py-2">{errorMessage(open.error)}</Text>
      ) : slots.length === 0 ? (
        <Text className="text-sm text-ink-mute py-2">No free slots in working hours.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {slots.map((s) => (
            <Chip
              key={s.start}
              label={s.displayTime}
              on={s.displayTime === props.value}
              onPress={() => props.onChange(s.displayTime)}
            />
          ))}
        </View>
      )}
      <View className="mt-3">
        <Field
          label="Or another time (24h)"
          placeholder="e.g. 18:45"
          value={onGrid ? '' : props.value}
          onChangeText={(t) => props.onChange(t.trim())}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          autoCorrect={false}
        />
      </View>
    </View>
  );
}
