import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useWindowClass } from '@/components/responsive';
import { useSession } from '@/lib/auth';
import { isNoOrganizationError, trpc } from '../../lib/trpc';

export default function AppLayout() {
  const { data: session, isPending } = useSession();
  // On wide windows (unfolded foldables, tablets) the tab bar becomes a side
  // rail, freeing vertical space and keeping nav within thumb reach.
  const sideRail = useWindowClass() !== 'compact';
  // Resolves the organization tenant calls will use (the server falls back to
  // the user's first membership). PRECONDITION_FAILED ⇒ no organization yet.
  const membership = trpc.auth.activeMembership.useQuery(undefined, {
    enabled: !!session,
    retry: false,
    meta: { handlesNoOrganization: true },
  });

  if (isPending || (session && membership.isLoading)) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#1a1815" />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (isNoOrganizationError(membership.error)) return <Redirect href="/no-organization" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1a1815',
        tabBarInactiveTintColor: '#9a978f',
        tabBarPosition: sideRail ? 'left' : 'bottom',
        // The side rail highlights the active item with a filled pill, which
        // defaults to the platform blue; keep it on-brand.
        tabBarActiveBackgroundColor: sideRail ? '#efede7' : undefined,
        tabBarStyle: sideRail
          ? { backgroundColor: '#fefcf7', borderRightColor: '#e9e7e0' }
          : { backgroundColor: '#fefcf7', borderTopColor: '#e9e7e0' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Feather name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Feather name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
