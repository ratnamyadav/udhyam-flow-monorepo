// Server helpers for Next.js: pull the session out of cookies on the request.

import type { Auth } from './server';

export async function getServerSession(auth: Auth, headers: Headers) {
  return auth.api.getSession({ headers });
}

export async function requireSession(auth: Auth, headers: Headers) {
  const session = await getServerSession(auth, headers);
  if (!session) throw new Error('Unauthorized');
  return session;
}
