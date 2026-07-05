import { beforeAll, describe, expect, it } from 'vitest';
import { decrypt, encrypt, REDACTED_SECRET } from '../src/crypto';

describe('encrypt/decrypt', () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = 'unit-test-secret-thirty-two-chars-min-x';
  });

  it('round-trips a plaintext value', () => {
    const original = 'cf_sk_live_abc_secret_value_123';
    const cipher = encrypt(original);
    expect(cipher).not.toContain(original);
    expect(cipher.startsWith('enc1:')).toBe(true);
    expect(decrypt(cipher)).toBe(original);
  });

  it('produces a different ciphertext each call (IV randomized)', () => {
    expect(encrypt('hello')).not.toBe(encrypt('hello'));
  });

  it('decrypt passes through plaintext that was never encrypted', () => {
    // Migration safety: rows written before encryption was added must
    // still be readable.
    expect(decrypt('legacy-plaintext')).toBe('legacy-plaintext');
  });

  it('exports a sentinel the API can use to omit secret round-trips', () => {
    expect(REDACTED_SECRET.length).toBeGreaterThan(0);
  });
});
