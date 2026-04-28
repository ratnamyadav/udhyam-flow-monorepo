import 'server-only';
import { auth } from '@udyamflow/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  return session;
}

export async function getActiveOrgId() {
  const session = await getSession();
  return session?.session?.activeOrganizationId ?? null;
}

export async function listMyOrganizations() {
  return auth.api.listOrganizations({ headers: await headers() }).catch(() => []);
}
