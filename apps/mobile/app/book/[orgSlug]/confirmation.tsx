import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

// Post-create confirmation. Reads `booking` + `ref` from query params so the
// user sees a reference code immediately even before they navigate back.

export default function ConfirmationScreen() {
  const router = useRouter();
  const { ref } = useLocalSearchParams<{ ref?: string }>();

  return (
    <View className="flex-1 bg-bg items-center justify-center px-8">
      <View className="w-12 h-12 rounded-md bg-ink items-center justify-center mb-5">
        <Text className="text-bg text-xl font-semibold">✓</Text>
      </View>
      <Text className="text-3xl font-semibold text-ink text-center">You're booked.</Text>
      <Text className="text-sm text-ink-mute mt-3 text-center leading-relaxed">
        A confirmation has been queued. Show this reference if you need to check in.
      </Text>
      <View className="mt-7 bg-surface border border-border rounded-xl px-5 py-3.5">
        <Text className="text-[10px] uppercase tracking-wider text-ink-mute font-mono">
          Reference
        </Text>
        <Text className="text-lg font-mono text-ink mt-1">{ref ?? '——————'}</Text>
      </View>

      <Pressable
        onPress={() => router.replace('/book')}
        className="mt-8 px-5 py-2.5 bg-surface border border-border rounded-md"
      >
        <Text className="text-ink font-medium">Book another</Text>
      </Pressable>
    </View>
  );
}
