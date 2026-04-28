import { signUp } from '@udyamflow/auth/expo-client';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setPending(true);
    setError(null);
    const res = await signUp.email({ name, email, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? 'Could not sign up');
      return;
    }
    router.replace('/(app)');
  }

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <Text className="text-3xl font-semibold text-ink">Create account</Text>
      <Text className="text-base text-ink-mute mt-1 mb-8">
        Free for 6 months. No card required.
      </Text>

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
      />

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Email</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
      />

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Password</Text>
      <TextInput
        secureTextEntry
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
