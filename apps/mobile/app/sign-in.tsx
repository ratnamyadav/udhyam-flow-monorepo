import { Link, Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { EmailCodeForm } from '@/components/email-code-form';
import { ResponsiveContent } from '@/components/responsive';
import { useSession } from '@/lib/auth';

export default function SignInScreen() {
  // Already signed in (or the session arrived after the (app) guard bounced
  // us back here while it was still refreshing): go to the app.
  const { data: session } = useSession();
  const router = useRouter();
  if (session) return <Redirect href="/(app)" />;

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <ResponsiveContent variant="form">
        <Text className="text-3xl font-semibold text-ink">UdyamFlow</Text>
        <Text className="text-base text-ink-mute mt-1 mb-8">Sign in to your workspace</Text>

        {/* The (app) layout sends users without an organization to /no-organization. */}
        <EmailCodeForm submitLabel="Sign in" onSignedIn={() => router.replace('/(app)')} />

        <Link href="/sign-up" className="mt-4 self-center">
          <Text className="text-sm text-ink-mute">
            Don't have an account? <Text className="text-ink underline">Sign up</Text>
          </Text>
        </Link>

        <View className="mt-8 pt-6 border-t border-border">
          <Text className="text-xs text-ink-mute text-center mb-2 uppercase tracking-wider font-mono">
            Booking with a provider?
          </Text>
          <Link href="/book" className="self-center">
            <Text className="text-sm text-ink underline text-center">Open the booking flow →</Text>
          </Link>
        </View>
      </ResponsiveContent>
    </View>
  );
}
