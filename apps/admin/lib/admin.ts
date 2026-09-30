import 'server-only';
import { auth } from '@udyamflow/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

// Staff gate for admin pages *and* server actions — actions are public
// POST endpoints, so each one must re-check, not rely on the page.
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');
  const user = session.user as typeof session.user & { role?: string };
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}

// "1,500" / "1500.50" → paise. Empty → null. Throws on junk / negatives.
export function rupeesToPaise(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? '')
    .replace(/,/g, '')
    .trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new Error('Invalid amount');
  return Math.round(n * 100);
}
