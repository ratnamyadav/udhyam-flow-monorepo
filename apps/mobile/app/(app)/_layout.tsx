import { useSession } from '@udyamflow/auth/expo-client';
import { Redirect, Stack } from 'expo-router';

export default function AppLayout() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  if (!session) return <Redirect href="/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
