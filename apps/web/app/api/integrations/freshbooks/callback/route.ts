import { completeFreshbooksConnection } from '@udyamflow/api/invoicing';
import { db } from '@udyamflow/db';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth-server';

// FreshBooks OAuth redirect target. `state` is an encrypted, user-bound
// token minted by invoicing.connectFreshbooks — see invoicing/oauth-state.ts.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const params = req.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const back = (q: Record<string, string>) =>
    `/settings/invoicing?${new URLSearchParams(q).toString()}`;

  if (params.get('error') || !code || !state) {
    redirect(back({ freshbooks: 'error', reason: params.get('error') ?? 'cancelled' }));
  }

  let target: string;
  try {
    await completeFreshbooksConnection(db, { code, state, userId: session.user.id });
    target = back({ freshbooks: 'connected' });
  } catch (err) {
    console.error('[freshbooks] OAuth callback failed:', err);
    target = back({ freshbooks: 'error', reason: (err as Error).message.slice(0, 120) });
  }
  // redirect() throws, so keep it outside the try.
  redirect(target);
}
