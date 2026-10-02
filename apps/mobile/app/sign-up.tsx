import { Link, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { EmailOTPForm } from '@/components/email-otp-form';
import { ResponsiveContent } from '@/components/responsive';
export default function SignUpScreen() {
  const router = useRouter();
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      >
        <ResponsiveContent variant="form">
          <Text className="text-3xl font-semibold text-ink">Create your account</Text>
          <Text className="text-base text-ink-mute mt-1 mb-8">
            Verify your email to continue. No password needed.
          </Text>
          <EmailOTPForm signup onSuccess={() => router.replace('/(app)')} />
          <Link href="/sign-in" className="mt-5 self-center">
            <Text className="text-sm text-ink underline">Already registered? Sign in</Text>
          </Link>
        </ResponsiveContent>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
