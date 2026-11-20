import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Text, View } from 'react-native';
import { EmailCodeForm } from '@/components/email-code-form';
import { ResponsiveContent } from '@/components/responsive';
import { LEGAL_URLS } from '@/lib/env';

export default function SignUpScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <ResponsiveContent variant="form">
        <Text className="text-3xl font-semibold text-ink">Create account</Text>
        <Text className="text-base text-ink-mute mt-1 mb-8">
          Free for 6 months. No card required.
        </Text>

        {/* A brand-new account has no organization yet; that screen hands off
            to web onboarding (and forwards to the app once a membership exists). */}
        <EmailCodeForm
          askName
          submitLabel="Create account →"
          onSignedIn={() => router.replace('/no-organization')}
        />

        <Text className="text-xs text-ink-mute text-center mt-3">
          By creating an account you agree to our{' '}
          <Text className="underline" onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.terms)}>
            Terms
          </Text>{' '}
          and{' '}
          <Text
            className="underline"
            onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.privacy)}
          >
            Privacy Policy
          </Text>
          .
        </Text>

        <Link href="/sign-in" className="mt-4 self-center">
          <Text className="text-sm text-ink-mute">
            Already have an account? <Text className="text-ink underline">Sign in</Text>
          </Text>
        </Link>
      </ResponsiveContent>
    </View>
  );
}
