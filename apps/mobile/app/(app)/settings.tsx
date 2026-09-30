import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ResponsiveContent } from '@/components/responsive';
import { expoAuthClient, signOut, useSession } from '@/lib/auth';
import { errorMessage, trpc } from '../../lib/trpc';

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

export default function SettingsScreen() {
  const { data: session, refetch: refetchSession } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  // The organization tenant calls currently resolve to (server-side fallback
  // to the first membership included) + the caller's role in it.
  const membership = trpc.auth.activeMembership.useQuery(undefined, {
    meta: { handlesNoOrganization: true },
  });

  const organizations = useQuery({
    queryKey: ['auth', 'organizations'],
    queryFn: async () => {
      const res = await expoAuthClient.organization.list();
      if (res.error) throw new Error(res.error.message ?? 'Could not load workspaces.');
      return res.data ?? [];
    },
  });

  const switchOrg = useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await expoAuthClient.organization.setActive({ organizationId });
      if (res.error) throw new Error(res.error.message ?? 'Could not switch workspace.');
    },
    onSuccess: async () => {
      refetchSession();
      // Every tenant query is scoped to the active organization.
      await queryClient.invalidateQueries();
    },
  });

  const activeOrgId = membership.data?.organizationId;
  const orgs = organizations.data ?? [];

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-6 pt-20 pb-12">
      <ResponsiveContent>
        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono">Settings</Text>
        <Text className="text-3xl font-semibold text-ink mt-1">Account</Text>

        <View className="bg-surface border border-border rounded-xl p-4 mt-7">
          <Text className="text-xs text-ink-mute uppercase tracking-wider">Signed in as</Text>
          <Text className="text-sm text-ink mt-1">{session?.user.email}</Text>
          {membership.data ? (
            <Text className="text-xs text-ink-mute mt-1">
              {ROLE_LABEL[membership.data.role] ?? membership.data.role} of the active workspace
            </Text>
          ) : null}
          <Text className="text-xs text-ink-mute mt-1">
            Manage workspace settings from the web app.
          </Text>
        </View>

        <Text className="text-xs text-ink-mute uppercase tracking-wider font-mono mt-8 mb-2">
          Workspace
        </Text>
        <View className="bg-surface border border-border rounded-xl overflow-hidden">
          {organizations.isLoading ? (
            <Text className="text-sm text-ink-mute p-4">Loading…</Text>
          ) : organizations.error ? (
            <Text className="text-sm text-danger p-4">{errorMessage(organizations.error)}</Text>
          ) : orgs.length === 0 ? (
            <Text className="text-sm text-ink-mute p-4">No workspaces yet.</Text>
          ) : (
            orgs.map((org, i) => {
              const active = org.id === activeOrgId;
              const switching = switchOrg.isPending && switchOrg.variables === org.id;
              return (
                <Pressable
                  key={org.id}
                  disabled={active || switchOrg.isPending}
                  onPress={() => switchOrg.mutate(org.id)}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <View className="flex-shrink">
                    <Text className="text-sm font-medium text-ink">{org.name}</Text>
                    <Text className="text-xs text-ink-mute font-mono">/{org.slug}</Text>
                  </View>
                  <Text className={`text-xs font-mono ${active ? 'text-accent' : 'text-ink-mute'}`}>
                    {active ? 'Active' : switching ? 'Switching…' : 'Switch'}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
        {switchOrg.error ? (
          <Text className="text-sm text-danger mt-2">{errorMessage(switchOrg.error)}</Text>
        ) : null}

        <Pressable
          onPress={async () => {
            await signOut();
            queryClient.clear();
            router.replace('/sign-in');
          }}
          className="bg-surface border border-border rounded-md py-3.5 mt-8 active:opacity-90"
        >
          <Text className="text-ink text-center font-medium">Sign out</Text>
        </Pressable>
      </ResponsiveContent>
    </ScrollView>
  );
}
