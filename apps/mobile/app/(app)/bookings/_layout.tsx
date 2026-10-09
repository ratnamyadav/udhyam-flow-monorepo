import { Stack } from 'expo-router';

// Groups bookings/index + bookings/[id] into a single "Bookings" tab with its
// own navigation stack (without this, each file becomes a separate tab).

// Deep links put the list underneath, so "back" lands on it. Cross-tab
// links (e.g. from the dashboard) need `withAnchor` for the same.
export const unstable_settings = { initialRouteName: 'index' };

export default function BookingsLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#fbfaf8' },
        headerStyle: { backgroundColor: '#fbfaf8' },
        headerTintColor: '#1a1815',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Booking', headerBackTitle: 'Bookings' }} />
      <Stack.Screen name="new" options={{ title: 'New booking', headerBackTitle: 'Bookings' }} />
      <Stack.Screen name="move" options={{ title: 'Move booking', headerBackTitle: 'Booking' }} />
      <Stack.Screen name="time-off" options={{ title: 'Time off', headerBackTitle: 'Bookings' }} />
    </Stack>
  );
}
