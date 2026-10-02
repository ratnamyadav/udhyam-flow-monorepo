import { randomInt } from 'node:crypto';
import { type Db, takeAuthRateLimit } from '@udyamflow/db';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';

export const normalizeAuthEmail = (email: string) => email.trim().toLowerCase();
const unavailable = () =>
  new APIError('BAD_REQUEST', {
    message: 'Unable to continue. Try again later or request a new code.',
  });

export function createEmailOTP(deliver: (email: string, otp: string) => Promise<void>) {
  return emailOTP({
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 5,
    storeOTP: 'hashed',
    resendStrategy: 'rotate',
    generateOTP: () => randomInt(0, 1_000_000).toString().padStart(6, '0'),
    disableSignUp: false,
    changeEmail: { enabled: false },
    sendVerificationOTP: async ({ email, otp, type }) => {
      if (type !== 'sign-in') throw unavailable();
      await deliver(email, otp);
    },
    rateLimit: { window: 60, max: 5 },
  });
}

export function emailOTPGuard(database: Db) {
  return createAuthMiddleware(async (ctx) => {
    const sending = ctx.path === '/email-otp/send-verification-otp';
    const verifying = ctx.path === '/sign-in/email-otp';
    // The generic checking/verification/password endpoints are unnecessary
    // for login and must not provide an alternate challenge oracle.
    if (ctx.path.startsWith('/email-otp/') && !sending) throw unavailable();
    if (
      [
        '/sign-up/email',
        '/sign-in/email',
        '/request-password-reset',
        '/reset-password',
        '/change-password',
        '/set-password',
        '/forget-password/email-otp',
        '/change-email',
      ].includes(ctx.path)
    )
      throw unavailable();
    if (!sending && !verifying) return;
    const body = ctx.body as Record<string, unknown>;
    if (typeof body.email !== 'string') throw unavailable();
    const email = normalizeAuthEmail(body.email);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw unavailable();
    body.email = email;
    if (sending && body.type !== 'sign-in') throw unavailable();
    if (verifying && (typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp)))
      throw unavailable();
    const action = sending ? 'send' : 'verify';
    // Email budgets are durable and shared across devices/IPs/challenges.
    if (!(await takeAuthRateLimit(database, `otp:${action}:email:${email}`, sending ? 3 : 15, 900)))
      throw unavailable();
    // Trust only the explicitly configured, edge-controlled header. When
    // absent, a shared fallback budget fails closed instead of trusting XFF.
    const header = process.env.TRUSTED_IP_HEADER;
    const ip = header ? ctx.headers?.get(header)?.trim() : undefined;
    const bucket = ip && ip.length <= 128 ? ip : 'unattributed';
    if (!(await takeAuthRateLimit(database, `otp:${action}:ip:${bucket}`, sending ? 20 : 60, 900)))
      throw unavailable();
    if (sending) {
      if (!(await takeAuthRateLimit(database, `otp:cooldown:${email}`, 1, 60))) throw unavailable();
      // Rotate invalidates every prior challenge, not just the newest row.
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(`sign-in-otp-${email}`);
    }
  });
}
