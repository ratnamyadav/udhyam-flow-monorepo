// Fixed-window rate limiter. Uses Upstash REST API when configured (works
// from any edge runtime); falls back to an in-process Map for local dev.
// Production deployments should set UPSTASH_REDIS_REST_URL — the in-memory
// fallback can't share state across processes / regions.

import { TRPCError } from '@trpc/server';

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();
const MAX_MEMORY_BUCKETS = 10_000;

let warnedAboutMemory = false;

async function takeUpstash(key: string, limit: number, windowSec: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  // INCR + EXPIRE atomically — use Redis pipeline.
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', `rl:${key}`],
      ['EXPIRE', `rl:${key}`, windowSec, 'NX'],
    ]),
  });
  if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
  const [incrResult] = (await res.json()) as Array<{ result: number }>;
  return (incrResult?.result ?? 0) <= limit;
}

function sweepMemory(now: number) {
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt < now) memoryBuckets.delete(key);
  }
}

function takeMemory(key: string, limit: number, windowSec: number): boolean {
  if (!warnedAboutMemory && process.env.NODE_ENV === 'production') {
    console.warn(
      '[rate-limit] Using in-memory bucket store in production — set UPSTASH_REDIS_REST_URL for cross-instance limits.',
    );
    warnedAboutMemory = true;
  }
  const now = Date.now();
  if (memoryBuckets.size >= MAX_MEMORY_BUCKETS) sweepMemory(now);
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
  let allowed: boolean;
  if (process.env.UPSTASH_REDIS_REST_URL) {
    try {
      allowed = await takeUpstash(args.key, args.limit, args.windowSec);
    } catch (err) {
      // Degrade to per-instance limiting rather than no limiting at all.
      console.error('[rate-limit] Upstash unavailable, using memory store', err);
      allowed = takeMemory(args.key, args.limit, args.windowSec);
    }
  } else {
    allowed = takeMemory(args.key, args.limit, args.windowSec);
  }
  if (!allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: args.message ?? 'Too many requests. Try again in a minute.',
    });
  }
}

// Client IP used as the bucket key for unauthenticated public endpoints.
//
// Only trust headers your edge actually sets — a client can send any header
// it likes. Set TRUSTED_IP_HEADER to the one your host overwrites (e.g.
// `cf-connecting-ip` behind Cloudflare, `x-real-ip` on Vercel). Without it
// we use `x-real-ip`, then the LAST `x-forwarded-for` hop (appended by the
// nearest proxy); the first hop is whatever the client claimed.
export function ipKeyFromHeaders(headers: Headers): string {
  const trusted = process.env.TRUSTED_IP_HEADER?.toLowerCase();
  if (trusted) {
    const value = headers.get(trusted)?.split(',').pop()?.trim();
    return value || 'unknown';
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  return forwarded || 'unknown';
}
