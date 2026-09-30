// Only allow same-origin relative paths as post-auth redirect targets. Anything
// else (absolute URLs, protocol-relative `//evil.com`, `/\evil.com`) falls back
// so a crafted `?callbackUrl=` can't bounce users off-site.
export function safeCallbackUrl(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  // Reject control characters / whitespace that browsers strip before parsing.
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return fallback;
  }
  return raw;
}
