import { completeZohoConnection } from '@udyamflow/api/invoicing';
import { db } from '@udyamflow/db';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth-server';

// Zoho OAuth redirect target. Zoho appends `accounts-server` (the user's
// data centre); completeZohoConnection host-checks it before use.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const params = req.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const back = (q: Record<string, string>) =>
    `/settings/invoicing?${new URLSearchParams(q).toString()}`;

  if (params.get('error') || !code || !state) {
    redirect(back({ zoho: 'error', reason: params.get('error') ?? 'cancelled' }));
  }

  let target: string;
  try {
    await completeZohoConnection(db, {
      code,
      state,
      userId: session.user.id,
      accountsServer: params.get('accounts-server'),
    });
    target = back({ zoho: 'connected' });
  } catch (err) {
    console.error('[zoho] OAuth callback failed:', err);
    target = back({ zoho: 'error', reason: (err as Error).message.slice(0, 120) });
  }
  // redirect() throws, so keep it outside the try.
  redirect(target);
}
