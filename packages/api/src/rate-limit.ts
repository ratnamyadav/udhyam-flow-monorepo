// Token-bucket rate limiter. Uses Upstash REST API when configured (works
// from any edge runtime); falls back to an in-process Map for local dev.
// Production deployments should set UPSTASH_REDIS_REST_URL — the in-memory
// fallback can't share state across processes / regions.

import { TRPCError } from '@trpc/server';

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

let warnedAboutMemory = false;

async function takeUpstash(key: string, limit: number, windowSec: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  // INCR + EXPIRE atomically — use Redis pipeline.
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, windowSec, 'NX'],
    ]),
  });
  if (!res.ok) return true; // fail open
  const [incrResult] = (await res.json()) as Array<{ result: number }>;
  return (incrResult?.result ?? 0) <= limit;
}

function takeMemory(key: string, limit: number, windowSec: number): boolean {
  if (!warnedAboutMemory && process.env.NODE_ENV === 'production') {
    console.warn(
      '[rate-limit] Using in-memory bucket store in production — set UPSTASH_REDIS_REST_URL for cross-instance limits.',
    );
    warnedAboutMemory = true;
  }
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export async function enforceRateLimit(args: {
  key: string;
  limit: number;
  windowSec: number;
  message?: string;
}): Promise<void> {
  const allowed = process.env.UPSTASH_REDIS_REST_URL
    ? await takeUpstash(args.key, args.limit, args.windowSec)
    : takeMemory(args.key, args.limit, args.windowSec);
  if (!allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: args.message ?? 'Too many requests. Try again in a minute.',
    });
  }
}

// Best-effort IP extraction — used as the bucket key for unauthenticated
// public endpoints (booking.create, booking.listSlots).
export function ipKeyFromHeaders(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
