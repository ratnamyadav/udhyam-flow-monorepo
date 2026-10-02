import { Link, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { EmailOTPForm } from '@/components/email-otp-form';
import { ResponsiveContent } from '@/components/responsive';
export default function SignInScreen() {
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
          <Text className="text-3xl font-semibold text-ink">UdyamFlow</Text>
          <Text className="text-base text-ink-mute mt-1 mb-8">Sign in with an email code</Text>
          <EmailOTPForm onSuccess={() => router.replace('/(app)')} />
          <Link href="/sign-up" className="mt-5 self-center">
            <Text className="text-sm text-ink underline">Create an account</Text>
          </Link>
          <View className="mt-8 pt-6 border-t border-border">
            <Text className="text-xs text-ink-mute text-center mb-3">
              Booking with a provider? No sign-in needed.
            </Text>
            <Link href="/book" className="self-center">
              <Text className="text-sm text-ink underline">Open the booking flow →</Text>
            </Link>
          </View>
        </ResponsiveContent>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
