import { signOut, useSession } from '@udyamflow/auth/expo-client';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ResponsiveContent } from '../../components/responsive';

export default function SettingsScreen() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <View className="flex-1 bg-bg px-6 pt-20">
      <ResponsiveContent>
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">Settings</Text>
        <Text className="text-3xl font-semibold text-ink mt-1">Account</Text>

        <View className="bg-surface border border-border rounded-xl p-4 mt-7">
          <Text className="text-xs text-ink-mute uppercase tracking-wider">Signed in as</Text>
          <Text className="text-sm text-ink mt-1">{session?.user.email}</Text>
          <Text className="text-xs text-ink-mute mt-1">
            Manage workspace settings from the web app.
          </Text>
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
      </ResponsiveContent>
    </View>
  );
}
