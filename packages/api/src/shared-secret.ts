import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time comparison for shared secrets (cron bearer token, MSG91
// webhook secret). Hashing both sides first gives equal-length buffers, so
// neither the content nor the length of the expected secret leaks via timing.
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1]?.trim() || null;
}
