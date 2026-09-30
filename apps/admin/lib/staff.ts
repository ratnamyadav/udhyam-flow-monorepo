import 'server-only';
import { appRouter, createTRPCContext } from '@udyamflow/api';
import { auth } from '@udyamflow/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

// Server-side gate for every staff page. Redirects signed-out visitors and
// returns `null` for signed-in non-staff so the layout can render a 403.
// Data comes from the tRPC admin router, which re-checks the role itself.
export async function getStaff() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect('/sign-in');
  const user = session.user as typeof session.user & { role?: string };
  if (user.role !== 'admin') return { user, caller: null };
  const caller = appRouter.createCaller(await createTRPCContext({ headers: h }));
  return { user, caller };
}

export async function requireStaffCaller() {
  const { caller } = await getStaff();
  if (!caller) redirect('/dashboard');
  return caller;
}
