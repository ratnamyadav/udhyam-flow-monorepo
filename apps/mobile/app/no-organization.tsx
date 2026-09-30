import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { signOut, useSession } from '@/lib/auth';
import { ONBOARDING_URL } from '../lib/env';
import { errorMessage, isNoOrganizationError, trpc } from '../lib/trpc';

// Shown when the signed-in user has no organization yet (tenant calls fail
// with PRECONDITION_FAILED). Workspace setup lives in the web onboarding flow.
export default function NoOrganizationScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending } = useSession();
  const membership = trpc.auth.activeMembership.useQuery(undefined, {
    enabled: !!session,
    retry: false,
    meta: { handlesNoOrganization: true },
  });

  if (isPending) return null;
  if (!session) return <Redirect href="/sign-in" />;
  // Onboarding finished (the server falls back to the first membership).
  if (membership.data) return <Redirect href="/(app)" />;

  const otherError =
    membership.error && !isNoOrganizationError(membership.error) ? membership.error : null;

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">Almost there</Text>
      <Text className="text-3xl font-semibold text-ink mt-1">Set up your workspace</Text>
      <Text className="text-sm text-ink-mute mt-3 leading-relaxed">
        {session.user.email} isn't part of a workspace yet. Finish onboarding on the web to create
        your booking page, then come back here.
      </Text>

      {otherError ? (
        <Text className="text-sm text-danger mt-4">{errorMessage(otherError)}</Text>
      ) : null}

      <Pressable
        onPress={() => void Linking.openURL(ONBOARDING_URL)}
        className="bg-ink rounded-md py-3.5 mt-8 active:opacity-90"
      >
        <Text className="text-bg text-center font-medium">Finish setup on the web →</Text>
      </Pressable>

      <Pressable
        onPress={() => void membership.refetch()}
        disabled={membership.isFetching}
        className="bg-surface border border-border rounded-md py-3.5 mt-3 active:opacity-90"
      >
        <Text className="text-ink text-center font-medium">
          {membership.isFetching ? 'Checking…' : "I've finished — check again"}
        </Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          await signOut();
          queryClient.clear();
          router.replace('/sign-in');
        }}
        className="mt-6 self-center"
      >
        <Text className="text-sm text-ink-mute underline">Sign out</Text>
      </Pressable>
    </View>
  );
}
