import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit, ipKeyFromHeaders } from '../src/rate-limit';

describe('rate limiter (memory backend)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        enforceRateLimit({ key: 'unit:under', limit: 5, windowSec: 60 }),
      ).resolves.toBeUndefined();
    }
  });

  it('rejects requests over the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit({ key: 'unit:over', limit: 3, windowSec: 60 });
    }
    await expect(
      enforceRateLimit({ key: 'unit:over', limit: 3, windowSec: 60 }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('resets after the window', async () => {
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit({ key: 'unit:reset', limit: 3, windowSec: 60 });
    }
    vi.advanceTimersByTime(61_000);
    await expect(
      enforceRateLimit({ key: 'unit:reset', limit: 3, windowSec: 60 }),
    ).resolves.toBeUndefined();
  });
});

describe('ipKeyFromHeaders', () => {
  afterEach(() => {
    delete process.env.TRUSTED_IP_HEADER;
  });

  it('ignores client-settable headers unless configured as trusted', () => {
    const h = new Headers();
    h.set('cf-connecting-ip', '203.0.113.7');
    h.set('x-real-ip', '198.51.100.1');
    expect(ipKeyFromHeaders(h)).toBe('198.51.100.1');
    process.env.TRUSTED_IP_HEADER = 'cf-connecting-ip';
    expect(ipKeyFromHeaders(h)).toBe('203.0.113.7');
  });

  it('uses the last x-forwarded-for hop (added by our proxy), not the client-claimed first', () => {
    const h = new Headers();
    h.set('x-forwarded-for', '1.2.3.4, 10.0.0.1, 203.0.113.9');
    expect(ipKeyFromHeaders(h)).toBe('203.0.113.9');
  });

  it('returns unknown when no IP headers are present', () => {
    expect(ipKeyFromHeaders(new Headers())).toBe('unknown');
  });
});

describe('rate limiter (Upstash backend)', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  });
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.unstubAllGlobals();
  });

  it('enforces the Redis counter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([{ result: 4 }, { result: 1 }])),
    );
    await expect(
      enforceRateLimit({ key: 'unit:upstash', limit: 3, windowSec: 60 }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('falls back to the memory store (not "allow everything") when Upstash is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await enforceRateLimit({ key: 'unit:down', limit: 1, windowSec: 60 });
    await expect(
      enforceRateLimit({ key: 'unit:down', limit: 1, windowSec: 60 }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});
