import { type NextRequest, NextResponse } from 'next/server';

// Cheap cookie check so signed-out visitors never hit the staff pages. The
// real gate (session + `user.role === 'admin'`) runs server-side in
// app/dashboard/layout.tsx and again in the tRPC admin router.
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

export function proxy(req: NextRequest) {
  if (SESSION_COOKIE_NAMES.some((n) => req.cookies.has(n))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/sign-in';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*', '/gst/:path*'],
};
