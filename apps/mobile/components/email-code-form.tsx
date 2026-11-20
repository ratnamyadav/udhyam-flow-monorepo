import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { emailOtp, signIn } from '@/lib/auth';

const RESEND_AFTER_SECONDS = 30;

// Passwordless sign-in: email → 6-digit code → signed in. Signing in with a
// new email creates the account, so sign-up uses the same form with a name
// field (`askName`). `onSignedIn` runs once the session is stored.
export function EmailCodeForm({
  askName = false,
  submitLabel,
  onSignedIn,
}: {
  askName?: boolean;
  submitLabel: string;
  onSignedIn: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  async function sendCode(to: string) {
    const res = await emailOtp.sendVerificationOtp({ email: to, type: 'sign-in' });
    if (res.error) throw new Error(res.error.message ?? 'Could not send the code');
    setSentTo(to);
    setCode('');
    setCooldown(RESEND_AFTER_SECONDS);
  }

  function onRequest() {
    const to = email.trim().toLowerCase();
    if (askName && !name.trim()) return setError('Enter your name.');
    if (!to.includes('@')) return setError('Enter your email address.');
    void run(() => sendCode(to));
  }

  function onVerify() {
    if (!sentTo) return;
    void run(async () => {
      const res = await signIn.emailOtp({
        email: sentTo,
        otp: code.trim(),
        ...(askName && name.trim() ? { name: name.trim() } : {}),
      });
      if (res.error) {
        throw new Error(
          res.error.code === 'TOO_MANY_ATTEMPTS' || res.error.code === 'OTP_EXPIRED'
            ? 'That code can no longer be used. Send a new one.'
            : res.error.code === 'INVALID_OTP'
              ? 'That code is not right. Check the latest email and try again.'
              : (res.error.message ?? 'Could not sign in'),
        );
      }
      onSignedIn();
    });
  }

  if (sentTo) {
    return (
      <View>
        <Text className="text-base text-ink-mute mb-6 leading-relaxed">
          We emailed a 6-digit code to <Text className="text-ink font-medium">{sentTo}</Text>. It
          expires in 10 minutes.
        </Text>

        <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Code</Text>
        <TextInput
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          onSubmitEditing={onVerify}
          className="border border-border rounded-md px-3 py-3 bg-surface text-ink text-xl tracking-[8px] mb-2"
        />

        {error ? <Text className="text-danger text-sm mb-2">{error}</Text> : null}

        <Pressable
          onPress={onVerify}
          disabled={pending || code.length !== 6}
          className={`bg-ink rounded-md py-3.5 mt-3 active:opacity-90 ${code.length !== 6 ? 'opacity-50' : ''}`}
        >
          <Text className="text-bg text-center font-medium">
            {pending ? 'Checking…' : submitLabel}
          </Text>
        </Pressable>

        <View className="flex-row justify-between mt-4">
          <Pressable
            onPress={() => {
              setSentTo(null);
              setError(null);
            }}
          >
            <Text className="text-sm text-ink-mute">Use a different email</Text>
          </Pressable>
          <Pressable
            disabled={pending || cooldown > 0}
            onPress={() => void run(() => sendCode(sentTo))}
          >
            <Text className={`text-sm ${cooldown > 0 ? 'text-ink-soft' : 'text-ink underline'}`}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      {askName ? (
        <>
          <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Name</Text>
          <TextInput
            autoCapitalize="words"
            autoComplete="name"
            value={name}
            onChangeText={setName}
            className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
          />
        </>
      ) : null}

      <Text className="text-xs text-ink-mute uppercase tracking-wider mb-1.5">Email</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={onRequest}
        className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-2"
      />

      {error ? <Text className="text-danger text-sm mb-2">{error}</Text> : null}

      <Pressable
        onPress={onRequest}
        disabled={pending}
        className="bg-ink rounded-md py-3.5 mt-3 active:opacity-90"
      >
        <Text className="text-bg text-center font-medium">
          {pending ? 'Sending code…' : 'Email me a code'}
        </Text>
      </Pressable>
    </View>
  );
}
