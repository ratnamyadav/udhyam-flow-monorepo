import { useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { formatDateTime, formatMoney, formatTime, statusLabel } from '../../../lib/format';
import { errorMessage, trpc } from '../../../lib/trpc';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const utils = trpc.useUtils();
  const query = trpc.booking.get.useQuery({ id }, { enabled: !!id });
  const booking = query.data;

  const onDone = () => {
    void utils.booking.invalidate();
  };
  const cancel = trpc.booking.cancel.useMutation({ onSuccess: onDone });
  const noShow = trpc.booking.markNoShow.useMutation({ onSuccess: onDone });
  const complete = trpc.booking.markComplete.useMutation({ onSuccess: onDone });
  const busy = cancel.isPending || noShow.isPending || complete.isPending;
  const mutationError = cancel.error ?? noShow.error ?? complete.error;

  if (query.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <Text className="text-sm text-ink-mute">Loading…</Text>
      </View>
    );
  }
  if (!booking) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-sm text-ink-mute text-center">
          {query.error ? errorMessage(query.error) : 'Booking not found.'}
        </Text>
      </View>
    );
  }

  const tz = booking.timezone;
  const isConfirmed = booking.status === 'confirmed';
  const canCancel = isConfirmed || booking.status === 'pending_payment';

  function resetErrors() {
    cancel.reset();
    noShow.reset();
    complete.reset();
  }

  function confirmCancel() {
    if (!booking) return;
    Alert.alert('Cancel booking?', `${booking.customerName} will be notified.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () => {
          resetErrors();
          cancel.mutate({ id: booking.id });
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-4 pb-12">
      <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">
        Ref · {booking.id.slice(-6).toUpperCase()}
      </Text>
      <Text className="text-3xl font-semibold text-ink mt-1">{booking.customerName}</Text>
      <Text className="text-sm text-ink-mute mt-1">
        {[booking.customerEmail, booking.customerPhone].filter(Boolean).join(' · ') || '—'}
      </Text>

      <View className="bg-surface border border-border rounded-xl p-4 mt-7">
        <Row
          label="When"
          value={`${formatDateTime(booking.slotStart, tz)}–${formatTime(booking.slotEnd, tz)}`}
        />
        <Row label="Timezone" value={tz} />
        <Row label="With" value={booking.resourceName} />
        {booking.serviceName ? <Row label="Service" value={booking.serviceName} /> : null}
        <Row label="Location" value={booking.locationName} />
        <Row label="Status" value={statusLabel(booking.status)} />
        <Row label="Payment" value={statusLabel(booking.paymentStatus)} />
        {booking.amountCents ? (
          <Row label="Amount" value={formatMoney(booking.amountCents, booking.currency)} />
        ) : null}
        {booking.status === 'pending_payment' && booking.holdExpiresAt ? (
          <Row label="Hold until" value={formatTime(booking.holdExpiresAt, tz)} />
        ) : null}
      </View>

      {mutationError ? (
        <Text className="text-sm text-danger mt-4">{errorMessage(mutationError)}</Text>
      ) : null}

      {canCancel ? (
        <View className="mt-6 gap-2">
          {isConfirmed ? (
            <>
              <ActionButton
                primary
                label={complete.isPending ? 'Saving…' : 'Mark complete'}
                disabled={busy}
                onPress={() => {
                  resetErrors();
                  complete.mutate({ id: booking.id });
                }}
              />
              <ActionButton
                label={noShow.isPending ? 'Saving…' : 'Mark no-show'}
                disabled={busy}
                onPress={() => {
                  resetErrors();
                  noShow.mutate({ id: booking.id });
                }}
              />
            </>
          ) : null}
          <ActionButton
            danger
            label={cancel.isPending ? 'Cancelling…' : 'Cancel booking'}
            disabled={busy}
            onPress={confirmCancel}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-md py-3.5 active:opacity-90 ${
        primary ? 'bg-ink' : 'bg-surface border border-border'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <Text
        className={`text-center font-medium ${
          primary ? 'text-bg' : danger ? 'text-danger' : 'text-ink'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1.5">
      <Text className="text-xs uppercase tracking-wider text-ink-mute font-mono">{label}</Text>
      <Text className="text-sm text-ink flex-shrink text-right">{value}</Text>
    </View>
  );
}
