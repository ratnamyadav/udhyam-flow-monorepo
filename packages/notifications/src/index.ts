export * from './email';
export * from './sms';
export * from './whatsapp';

// Helpful boolean for UI gating — the per-tenant SMS/WhatsApp toggles should
// be disabled when the server isn't configured for delivery.
export function isMsg91Configured(): boolean {
  return !!process.env.MSG91_AUTH_KEY;
}
