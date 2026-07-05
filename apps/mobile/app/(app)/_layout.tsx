import { useSession } from '@udyamflow/auth/expo-client';
import { Redirect, Tabs } from 'expo-router';

export default function AppLayout() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  if (!session) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1a1815',
        tabBarInactiveTintColor: '#9a978f',
        tabBarStyle: { backgroundColor: '#fefcf7', borderTopColor: '#e9e7e0' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
