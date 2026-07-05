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
  it('prefers cf-connecting-ip', () => {
    const h = new Headers();
    h.set('cf-connecting-ip', '203.0.113.7');
    h.set('x-real-ip', '198.51.100.1');
    expect(ipKeyFromHeaders(h)).toBe('203.0.113.7');
  });

  it('falls back to x-forwarded-for (first hop)', () => {
    const h = new Headers();
    h.set('x-forwarded-for', '203.0.113.9, 10.0.0.1, 192.168.1.1');
    expect(ipKeyFromHeaders(h)).toBe('203.0.113.9');
  });

  it('returns unknown when no IP headers are present', () => {
    expect(ipKeyFromHeaders(new Headers())).toBe('unknown');
  });
});
