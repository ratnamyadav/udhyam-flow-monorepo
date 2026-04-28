import { signIn } from '@udyamflow/auth/expo-client';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setPending(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? 'Could not sign in');
      return;
    }
    router.replace('/(app)');
  }

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <Text className="text-3xl font-semibold text-ink">UdyamFlow</Text>
      <Text className="text-base text-ink-mute mt-1 mb-8">Sign in to your workspace</Text>

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Email</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
      />

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Password</Text>
      <TextInput
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-2"
      />

      {error ? <Text className="text-red-600 text-sm mb-2">{error}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={pending}
        className="bg-ink rounded-md py-3.5 mt-3 active:opacity-90"
      >
        <Text className="text-bg text-center font-medium">
          {pending ? 'Signing in…' : 'Sign in'}
        </Text>
      </Pressable>

      <Link href="/sign-up" className="mt-4 self-center">
        <Text className="text-sm text-ink-mute">
          Don't have an account? <Text className="text-ink underline">Sign up</Text>
        </Text>
      </Link>
    </View>
  );
}
