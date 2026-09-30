import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { type BrandColors, BrandHeader, useTenantBranding } from '../../../lib/branding';
import { formatDateTime, formatMoney, formatTime } from '../../../lib/format';
import { errorMessage, trpc } from '../../../lib/trpc';

// Post-create confirmation. `booking` + `ref` come from query params (also
// when the app is opened from the web return URL
// https://udyamflow.com/book/<slug>/confirmation?booking=<id>). For paid
// bookings we poll booking.publicStatus until the payment webhook moves the
// booking out of `pending_payment`.

const POLL_MS = 3_000;
const POLL_WINDOW_MS = 2 * 60_000;

export default function ConfirmationScreen() {
  const router = useRouter();
  const {
    orgSlug,
    booking: bookingId,
    ref,
  } = useLocalSearchParams<{
    orgSlug: string;
    booking?: string;
    ref?: string;
  }>();
  const [pollStartedAt, setPollStartedAt] = useState(() => Date.now());
  const [pollTimedOut, setPollTimedOut] = useState(false);
  useEffect(() => {
    // Re-render when the polling window closes so the UI can say so.
    setPollTimedOut(false);
    const remaining = POLL_WINDOW_MS - (Date.now() - pollStartedAt);
    const timer = setTimeout(() => setPollTimedOut(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [pollStartedAt]);

  const status = trpc.booking.publicStatus.useQuery(
    { bookingId: bookingId ?? '' },
    {
      enabled: !!bookingId,
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        if (s && s !== 'pending_payment') return false;
        if (query.state.data?.paymentStatus === 'failed') return false;
        return Date.now() - pollStartedAt < POLL_WINDOW_MS ? POLL_MS : false;
      },
    },
  );
  const createCheckout = trpc.payment.createCheckout.useMutation();
  const { branding, colors } = useTenantBranding(orgSlug);

  const data = status.data;
  const reference = data?.referenceCode ?? ref ?? '——————';

  async function payNow() {
    if (!bookingId) return;
    try {
      const { redirectUrl } = await createCheckout.mutateAsync({ bookingId });
      await WebBrowser.openBrowserAsync(redirectUrl);
    } catch {
      // Shown via createCheckout.error (e.g. the hold already expired).
    } finally {
      setPollStartedAt(Date.now());
      void status.refetch();
    }
  }

  function checkAgain() {
    setPollStartedAt(Date.now());
    void status.refetch();
  }

  const bookAgain = () => router.replace(orgSlug ? `/book/${orgSlug}` : '/book');

  // ---------------------------------------------------------------------------
  let view: {
    badge: string;
    title: string;
    body: string;
    tone: 'ok' | 'wait' | 'bad';
  };
  let actions: ReactNode = null;

  if (!bookingId || (!data && !status.isLoading)) {
    // No id (or status unavailable) — show what we know from the URL.
    view = {
      badge: '✓',
      title: "You're booked.",
      body: status.error
        ? `We couldn't load the latest status (${errorMessage(status.error)}). Keep your reference handy.`
        : 'Show this reference if you need to check in.',
      tone: 'ok',
    };
  } else if (!data) {
    view = { badge: '…', title: 'Checking your booking…', body: '', tone: 'wait' };
  } else if (data.status === 'confirmed' || data.status === 'completed') {
    view = {
      badge: '✓',
      title: "You're booked.",
      body:
        data.paymentStatus === 'paid'
          ? 'Payment received. A confirmation is on its way.'
          : 'A confirmation is on its way. Show this reference if you need to check in.',
      tone: 'ok',
    };
  } else if (data.status === 'pending_payment' && data.paymentStatus === 'failed') {
    view = {
      badge: '!',
      title: 'Payment failed',
      body: data.holdExpiresAt
        ? `Your slot is held until ${formatTime(data.holdExpiresAt, data.timezone)}. Try paying again.`
        : 'Try paying again.',
      tone: 'bad',
    };
    actions = (
      <PrimaryButton
        colors={colors}
        label="Try payment again"
        onPress={payNow}
        busy={createCheckout.isPending}
      />
    );
  } else if (data.status === 'pending_payment') {
    view = {
      badge: '…',
      title: pollTimedOut ? 'Still waiting for payment' : 'Waiting for payment…',
      body: pollTimedOut
        ? "We haven't seen your payment yet. If you paid, it can take a moment — check again, or reopen the payment page."
        : `Complete payment in the browser${
            data.holdExpiresAt ? ` before ${formatTime(data.holdExpiresAt, data.timezone)}` : ''
          } to confirm your slot.`,
      tone: 'wait',
    };
    actions = (
      <>
        <PrimaryButton
          colors={colors}
          label="Open payment page"
          onPress={payNow}
          busy={createCheckout.isPending}
        />
        {pollTimedOut ? <SecondaryButton label="Check again" onPress={checkAgain} /> : null}
      </>
    );
  } else if (data.status === 'expired') {
    view = {
      badge: '×',
      title: 'Your hold expired',
      body: "Payment wasn't completed in time, so the slot was released. Pick a new time to book again.",
      tone: 'bad',
    };
    actions = <PrimaryButton colors={colors} label="Pick a new time" onPress={bookAgain} />;
  } else if (data.status === 'cancelled') {
    view = {
      badge: '×',
      title: 'Booking cancelled',
      body:
        data.paymentStatus === 'refunded' || data.paymentStatus === 'partially_refunded'
          ? 'This booking was cancelled and your payment refunded.'
          : 'This booking was cancelled.',
      tone: 'bad',
    };
    actions = <PrimaryButton colors={colors} label="Book again" onPress={bookAgain} />;
  } else {
    view = { badge: '•', title: 'Booking', body: `Status: ${data.status}`, tone: 'wait' };
  }

  const polling =
    data?.status === 'pending_payment' && !pollTimedOut && data.paymentStatus !== 'failed';

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="flex-grow items-center justify-center px-8 py-16"
    >
      {branding ? (
        <View className="self-stretch mb-10">
          <BrandHeader branding={branding} colors={colors} />
        </View>
      ) : null}
      <View
        className={`w-12 h-12 items-center justify-center mb-5 ${
          view.tone === 'bad' ? 'bg-danger' : view.tone === 'wait' ? 'bg-surface-mute' : ''
        }`}
        style={[
          { borderRadius: colors.radius },
          view.tone === 'ok' ? { backgroundColor: colors.accent } : null,
        ]}
      >
        {polling ? (
          <ActivityIndicator color="#1a1815" />
        ) : (
          <Text
            className={`text-xl font-semibold ${
              view.tone === 'wait' ? 'text-ink' : view.tone === 'bad' ? 'text-bg' : ''
            }`}
            style={view.tone === 'ok' ? { color: colors.accentFg } : undefined}
          >
            {view.badge}
          </Text>
        )}
      </View>
      <Text className="text-3xl font-semibold text-ink text-center" accessibilityRole="header">
        {view.title}
      </Text>
      {view.body ? (
        <Text className="text-sm text-ink-mute mt-3 text-center leading-relaxed">{view.body}</Text>
      ) : null}

      <View className="mt-7 self-stretch bg-surface border border-border rounded-xl px-5 py-3.5">
        <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono">
          Reference
        </Text>
        <Text className="text-lg font-mono text-ink mt-1">{reference}</Text>
        {data ? (
          <View className="mt-3 gap-1">
            <Text className="text-sm text-ink">
              {formatDateTime(data.slotStart, data.timezone)}–
              {formatTime(data.slotEnd, data.timezone)}
            </Text>
            <Text className="text-xs text-ink-mute">
              {[data.serviceName, data.resourceName, data.orgName].filter(Boolean).join(' · ')}
            </Text>
            <Text className="text-xs text-ink-mute font-mono">{data.timezone}</Text>
            {data.amountCents ? (
              <Text className="text-xs text-ink-mute">
                {formatMoney(data.amountCents, data.currency)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {createCheckout.error ? (
        <Text className="text-sm text-danger mt-4 text-center">
          {errorMessage(createCheckout.error)}
        </Text>
      ) : null}

      {actions ? <View className="mt-6 self-stretch gap-2">{actions}</View> : null}

      <Pressable
        onPress={() => router.replace('/book')}
        className="mt-8 px-5 py-2.5 bg-surface border border-border rounded-md"
      >
        <Text className="text-ink font-medium">Book another</Text>
      </Pressable>
    </ScrollView>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  colors,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  colors: BrandColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      className={`py-3.5 active:opacity-90 ${busy ? 'opacity-60' : ''}`}
      style={{ backgroundColor: colors.accent, borderRadius: colors.radius }}
    >
      <Text className="text-center font-medium" style={{ color: colors.accentFg }}>
        {busy ? 'Opening…' : label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-surface border border-border rounded-md py-3.5 active:opacity-90"
    >
      <Text className="text-ink text-center font-medium">{label}</Text>
    </Pressable>
  );
}
