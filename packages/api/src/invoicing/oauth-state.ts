import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from '../crypto';

// OAuth `state` parameter for third-party connects. We encrypt (AES-GCM,
// authenticated) the org + user the flow was started for, so the callback
// can trust it without a server-side session table. A forged or tampered
// state fails GCM auth; an expired one is rejected by `exp`.

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthState = { organizationId: string; userId: string };

export function createOAuthState(s: OAuthState, now = Date.now()): string {
  return encrypt(
    JSON.stringify({
      o: s.organizationId,
      u: s.userId,
      e: now + STATE_TTL_MS,
      n: randomBytes(8).toString('hex'),
    }),
  );
}

export function verifyOAuthState(state: string, userId: string, now = Date.now()): OAuthState {
  // `decrypt` passes non-prefixed input straight through (legacy plaintext
  // support), so reject anything that isn't one of ours up front.
  if (!state.startsWith('enc1:')) throw new Error('Invalid OAuth state');
  let parsed: { o?: unknown; u?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(decrypt(state));
  } catch {
    throw new Error('Invalid OAuth state');
  }
  if (
    typeof parsed.o !== 'string' ||
    typeof parsed.u !== 'string' ||
    typeof parsed.e !== 'number'
  ) {
    throw new Error('Invalid OAuth state');
  }
  if (parsed.e < now) throw new Error('OAuth state expired — start the connection again');
  if (parsed.u !== userId) throw new Error('OAuth state belongs to a different user');
  return { organizationId: parsed.o, userId: parsed.u };
}
