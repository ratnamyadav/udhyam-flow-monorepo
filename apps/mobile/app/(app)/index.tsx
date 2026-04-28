import { signOut, useSession } from '@udyamflow/auth/expo-client';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function HomeScreen() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user;

  return (
    <View className="flex-1 bg-bg px-6 pt-20">
      <Text className="text-xs text-ink-mute uppercase tracking-wider">UdyamFlow mobile</Text>
      <Text className="text-3xl font-semibold text-ink mt-1">
        Hello, {user?.name?.split(' ')[0] ?? 'there'}
      </Text>
      <Text className="text-base text-ink-mute mt-3 leading-relaxed">
        You're signed in. Tenant booking and dashboard views ship in a follow-up — for now this app
        only handles auth so we can validate the BetterAuth session flow on device.
      </Text>

      <View className="mt-8 bg-surface border border-border rounded-xl p-4">
        <Text className="text-xs text-ink-mute uppercase tracking-wider">Session</Text>
        <Text className="text-sm text-ink mt-1">{user?.email}</Text>
        <Text className="text-xs text-ink-mute mt-1">user.id: {user?.id}</Text>
      </View>

      <Pressable
        onPress={async () => {
          await signOut();
          router.replace('/sign-in');
        }}
        className="bg-surface border border-border rounded-md py-3.5 mt-8 active:opacity-90"
      >
        <Text className="text-ink text-center font-medium">Sign out</Text>
      </Pressable>
    </View>
  );
}
