import { type NextRequest, NextResponse } from 'next/server';

// Lightweight cookie check — full session validation happens in server components
// and the tRPC middleware. This just blocks unauthed users from reaching the
// authed shell and bounces them to /sign-in with a callbackUrl.
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

const AUTHED_PREFIXES = ['/dashboard', '/bookings', '/settings', '/onboarding'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  const hasSession = SESSION_COOKIE_NAMES.some((n) => req.cookies.has(n));
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/sign-in';
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*', '/bookings/:path*', '/settings/:path*', '/onboarding/:path*'],
};
