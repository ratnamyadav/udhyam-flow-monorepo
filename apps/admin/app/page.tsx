import { auth } from '@udyamflow/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminIndexPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');
  redirect('/dashboard');
}
