import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { signUp } from '@/lib/auth';
import { trpc } from '../lib/trpc';

type Outcome = { kind: 'verify'; email: string } | { kind: 'sign-in' };

export default function SignUpScreen() {
  const router = useRouter();
  const providers = trpc.auth.providers.useQuery();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function onSubmit() {
    setPending(true);
    setError(null);
    const trimmedEmail = email.trim();
    const res = await signUp.email({ name: name.trim(), email: trimmedEmail, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? 'Could not sign up');
      return;
    }
    // No token ⇒ BetterAuth didn't create a session (email verification on).
    if (!res.data?.token) {
      setOutcome(
        providers.data?.emailVerificationRequired
          ? { kind: 'verify', email: trimmedEmail }
          : { kind: 'sign-in' },
      );
      return;
    }
    // A brand-new account has no organization yet; that screen hands off to
    // web onboarding (and forwards to the app once a membership exists).
    router.replace('/no-organization');
  }

  if (outcome) {
    return (
      <View className="flex-1 bg-bg px-6 justify-center">
        <Text className="text-3xl font-semibold text-ink">
          {outcome.kind === 'verify' ? 'Check your email' : 'Account created'}
        </Text>
        <Text className="text-base text-ink-mute mt-3 leading-relaxed">
          {outcome.kind === 'verify'
            ? `We sent a verification link to ${outcome.email}. Verify your email, then sign in.`
            : 'Sign in to continue.'}
        </Text>
        <Pressable
          onPress={() => router.replace('/sign-in')}
          className="bg-ink rounded-md py-3.5 mt-8 active:opacity-90"
        >
          <Text className="text-bg text-center font-medium">Go to sign in →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <Text className="text-3xl font-semibold text-ink">Create account</Text>
      <Text className="text-base text-ink-mute mt-1 mb-8">
        Free for 6 months. No card required.
      </Text>

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Name</Text>
      <TextInput
        autoCapitalize="words"
        autoComplete="name"
        value={name}
        onChangeText={setName}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
      />

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Email</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
      />

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Password</Text>
      <TextInput
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-2"
      />

      {error ? <Text className="text-danger text-sm mb-2">{error}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={pending}
        className="bg-ink rounded-md py-3.5 mt-3 active:opacity-90"
      >
        <Text className="text-bg text-center font-medium">
          {pending ? 'Creating…' : 'Create account →'}
        </Text>
      </Pressable>

      <Link href="/sign-in" className="mt-4 self-center">
        <Text className="text-sm text-ink-mute">
          Already have an account? <Text className="text-ink underline">Sign in</Text>
        </Text>
      </Link>
    </View>
  );
}
