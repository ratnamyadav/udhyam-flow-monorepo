import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ResponsiveContent } from '../../components/responsive';

// Entry point for the customer booking flow. Customers paste / type the
// tenant's workspace code (the slug) and we hand them off to the per-tenant
// booking screen.

export default function BookEntryScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');

  const trimmed = code
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\/book\//, '');
  const canGo = /^[a-z0-9-]+$/.test(trimmed) && trimmed.length >= 2;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-16 pb-12">
      <ResponsiveContent variant="form">
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">
          Book an appointment
        </Text>
        <Text className="text-3xl font-semibold text-ink mt-1">Where are you booking?</Text>
        <Text className="text-sm text-ink-mute mt-3 leading-relaxed">
          Paste the workspace link your provider sent you, or type their code.
        </Text>

        <View className="mt-7 bg-surface border border-border rounded-xl p-4">
          <Text className="text-[11px] uppercase tracking-wider text-ink-mute font-mono mb-2">
            Workspace code
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. patel-clinic"
            value={code}
            onChangeText={setCode}
            className="text-base text-ink py-2"
          />
        </View>

        <Pressable
          onPress={() => router.push(`/book/${trimmed}`)}
          disabled={!canGo}
          className={`mt-5 rounded-md py-3.5 ${canGo ? 'bg-ink' : 'bg-surface-mute'}`}
        >
          <Text className={`text-center font-medium ${canGo ? 'text-bg' : 'text-ink-mute'}`}>
            Continue →
          </Text>
        </Pressable>
      </ResponsiveContent>
    </ScrollView>
  );
}
