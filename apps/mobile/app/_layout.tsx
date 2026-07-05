import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TRPCProvider } from '../lib/trpc';
import '../global.css';

export default function RootLayout() {
  return (
    <TRPCProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fbfaf8' } }} />
    </TRPCProvider>
  );
}
