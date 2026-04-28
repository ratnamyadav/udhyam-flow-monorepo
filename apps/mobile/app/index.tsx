import { useSession } from '@udyamflow/auth/expo-client';
import { Redirect } from 'expo-router';

export default function Index() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  return <Redirect href={session ? '/(app)' : '/sign-in'} />;
}
