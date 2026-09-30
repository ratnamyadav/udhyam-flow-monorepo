import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM at-rest encryption for tenant secrets (Cashfree secret key
// etc.). The key comes from ENCRYPTION_KEY; deployments that predate it fall
// back to one derived from BETTER_AUTH_SECRET.
//
// Rotation: set ENCRYPTION_KEY to the new value and move the old one to
// ENCRYPTION_KEY_PREVIOUS. Reads try every key; writes use the current one.
//
// Output: `enc1:${ivHex}:${authTagHex}:${cipherHex}` so the value is self-
// describing and we can detect plaintext leftovers during migration.

const PREFIX = 'enc1:';

const derive = (secret: string) => createHash('sha256').update(secret).digest();

function keys(): Buffer[] {
  const candidates = [
    process.env.ENCRYPTION_KEY,
    process.env.ENCRYPTION_KEY_PREVIOUS,
    process.env.BETTER_AUTH_SECRET,
  ].filter((s): s is string => !!s);
  if (candidates.length === 0) {
    throw new Error('ENCRYPTION_KEY (or BETTER_AUTH_SECRET) must be set to encrypt tenant secrets');
  }
  return candidates.map(derive);
}

export function encrypt(plaintext: string): string {
  const [key] = keys();
  const iv = randomBytes(12); // GCM standard
  const cipher = createCipheriv('aes-256-gcm', key!, iv);
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
  for (const key of keys()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(encHex, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Wrong key (auth tag mismatch) — try the next one.
    }
  }
  throw new Error('Could not decrypt: no configured key matches');
}

// Sentinel returned by the API when a tenant has a key configured but we
// don't want to leak it to the UI. The settings page renders this as
// "•••••• Saved" rather than the actual value.
export const REDACTED_SECRET = '••••••';
