import { useSession } from '@udyamflow/auth/expo-client';
import { Redirect, Tabs } from 'expo-router';
import { useWindowClass } from '../../components/responsive';

export default function AppLayout() {
  const { data: session, isPending } = useSession();
  // On wide windows (unfolded foldables, tablets) the tab bar becomes a side
  // rail, freeing vertical space and keeping nav within thumb reach.
  const sideRail = useWindowClass() !== 'compact';
  if (isPending) return null;
  if (!session) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1a1815',
        tabBarInactiveTintColor: '#9a978f',
        tabBarPosition: sideRail ? 'left' : 'bottom',
        tabBarStyle: sideRail
          ? { backgroundColor: '#fefcf7', borderRightColor: '#e9e7e0' }
          : { backgroundColor: '#fefcf7', borderTopColor: '#e9e7e0' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
