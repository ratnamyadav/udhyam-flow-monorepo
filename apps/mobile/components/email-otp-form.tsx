import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { expoAuthClient, useSession } from '@/lib/auth';

export function EmailOTPForm({
  signup = false,
  onSuccess,
}: {
  signup?: boolean;
  onSuccess: () => void | Promise<void>;
}) {
  const { data: session } = useSession();
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!verified || !session?.user) return;
    setVerified(false);
    void Promise.resolve(onSuccess()).catch(() => {
      setMessage('Unable to continue. Please try again.');
    });
  }, [verified, session?.user, onSuccess]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  async function send() {
    if (busy || remaining) return;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || (signup && !name.trim())) {
      setMessage('Enter your email and name to continue.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await expoAuthClient.emailOtp.sendVerificationOtp({
        email: normalized,
        type: 'sign-in',
      });
      if (result.error) {
        setMessage('Unable to send a code. Wait a moment and try again.');
        return;
      }
      setEmail(normalized);
      setSent(true);
      setCode('');
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
      setMessage('Check your inbox. Codes expire in 5 minutes. Only the newest code works.');
    } catch {
      setMessage('Unable to send a code. Wait a moment and try again.');
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await expoAuthClient.signIn.emailOtp({
        email,
        otp: code,
        ...(signup ? { name: name.trim() } : {}),
      });
      if (result.error) {
        setMessage('Unable to verify this code. Check it or request a new one.');
        return;
      }
      setCode('');
      await expoAuthClient.getSession();
      // The protected route reads the reactive session, not the fetch result.
      setVerified(true);
    } catch {
      setMessage('Unable to verify this code. Check it or request a new one.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      {!sent && (
        <>
          {signup && (
            <>
              <Text className="text-sm text-ink-mute mb-2">Your name</Text>
              <TextInput
                accessibilityLabel="Your name"
                autoComplete="name"
                maxLength={100}
                value={name}
                editable={!busy}
                onChangeText={setName}
                className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
              />
            </>
          )}
          <Text className="text-sm text-ink-mute mb-2">Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            maxLength={254}
            value={email}
            editable={!busy}
            onChangeText={setEmail}
            className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
          />
        </>
      )}
      {sent && (
        <>
          <Text className="text-sm text-ink-mute mb-3">Enter the code sent to {email}.</Text>
          <TextInput
            accessibilityLabel="6-digit email code"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            editable={!busy}
            autoFocus
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            onSubmitEditing={verify}
            className="border border-border rounded-md px-3 py-3 bg-surface text-ink mb-4"
          />
        </>
      )}
      <Text accessibilityLiveRegion="polite" className="text-sm text-ink-mute mb-3">
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy || (sent && code.length !== 6)}
        onPress={sent ? verify : send}
        className="bg-ink rounded-md py-3.5 disabled:opacity-50"
      >
        <Text className="text-bg text-center font-medium">
          {busy ? 'Please wait…' : sent ? 'Verify and continue' : 'Email me a code'}
        </Text>
      </Pressable>
      {sent && (
        <View className="flex-row justify-between mt-4">
          <Pressable accessibilityRole="button" disabled={busy || remaining > 0} onPress={send}>
            <Text className="text-ink underline">
              {remaining ? `Resend in ${remaining}s` : 'Resend code'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setSent(false);
              setCode('');
              setMessage('');
              setResendAt(0);
            }}
          >
            <Text className="text-ink underline">Change email / Back</Text>
          </Pressable>
        </View>
      )}
      <Text className="text-xs text-ink-mute mt-5">
        No password needed. Use the same email to keep your existing account.
      </Text>
    </View>
  );
}
