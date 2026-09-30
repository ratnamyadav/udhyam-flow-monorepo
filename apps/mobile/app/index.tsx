import { Redirect } from 'expo-router';
import { useSession } from '@/lib/auth';

export default function Index() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  return <Redirect href={session ? '/(app)' : '/sign-in'} />;
}
