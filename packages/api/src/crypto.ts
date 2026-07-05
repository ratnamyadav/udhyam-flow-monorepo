import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM at-rest encryption for tenant secrets (Cashfree API key etc.).
// The key is deterministically derived from BETTER_AUTH_SECRET so we don't
// need a separate KMS for v1. Rotating BETTER_AUTH_SECRET would invalidate
// every encrypted value — track that operationally.
//
// Output: `${ivHex}:${authTagHex}:${cipherHex}` so the value is self-
// describing and we can detect plaintext leftovers during migration.

const PREFIX = 'enc1:';

function getKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET must be set to encrypt tenant secrets');
  }
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // GCM standard
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string): string {
  if (!payload.startsWith(PREFIX)) {
    // Backwards-compat: rows written before encryption was added are
    // plaintext. Return as-is so reads don't crash; writes will re-encrypt.
    return payload;
  }
  const [ivHex, tagHex, encHex] = payload.slice(PREFIX.length).split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

// Sentinel returned by the API when a tenant has a key configured but we
// don't want to leak it to the UI. The settings page renders this as
// "•••••• Saved" rather than the actual value.
export const REDACTED_SECRET = '••••••';
