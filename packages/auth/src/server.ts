// Shared BetterAuth server. The Next.js apps re-export the handler at
// `app/api/auth/[...all]/route.ts`; the Expo app talks to it over HTTP.

import { expo } from '@better-auth/expo';
import { db } from '@udyamflow/db';
import * as schema from '@udyamflow/db/schema';
import { sendEmail } from '@udyamflow/notifications';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins/organization';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

// Email verification is enabled when SMTP/Resend is configured. In pure dev
// (no RESEND_API_KEY) the link still prints to console, but we keep the
// flag off so contributors don't need to fish links out of the terminal on
// every sign-up.
const requireEmailVerification = !!process.env.RESEND_API_KEY;

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your UdyamFlow password',
        html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;">
            <h2 style="margin:0 0 12px 0;font-weight:500;color:#1a1815;">Reset your password</h2>
            <p style="color:#5e5b54;line-height:1.6;">
              We received a request to reset your password. The link below expires in one hour.
            </p>
            <p style="margin:24px 0;">
              <a href="${url}" style="background:#1a1815;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;display:inline-block;">
                Reset password
              </a>
            </p>
            <p style="color:#9a978f;font-size:12px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `.trim(),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your email — UdyamFlow',
        html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;">
            <h2 style="margin:0 0 12px 0;font-weight:500;color:#1a1815;">Welcome to UdyamFlow</h2>
            <p style="color:#5e5b54;line-height:1.6;">
              Confirm your email so we can finish setting up your workspace.
            </p>
            <p style="margin:24px 0;">
              <a href="${url}" style="background:#1a1815;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;display:inline-block;">
                Verify email
              </a>
            </p>
          </div>
        `.trim(),
      });
    },
  },
  // Google sign-in renders only when both client id + secret are set.
  socialProviders: process.env.GOOGLE_CLIENT_ID
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        },
      }
    : undefined,
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  trustedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'udyamflow://'],
  plugins: [
    organization({
      sendInvitationEmail: async (data) => {
        const url = `${baseURL}/accept-invitation/${data.id}`;
        await sendEmail({
          to: data.email,
          subject: `You've been invited to join ${data.organization.name} on UdyamFlow`,
          html: `
            <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;">
              <h2 style="margin:0 0 12px 0;font-weight:500;color:#1a1815;">
                Join ${data.organization.name} on UdyamFlow
              </h2>
              <p style="color:#5e5b54;line-height:1.6;">
                You've been invited as <strong>${data.role}</strong>. Click below to accept and access the dashboard.
              </p>
              <p style="margin:24px 0;">
                <a href="${url}" style="background:#1a1815;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;display:inline-block;">
                  Accept invitation
                </a>
              </p>
              <p style="color:#9a978f;font-size:12px;">
                Or paste this link into your browser: ${url}
              </p>
            </div>
          `.trim(),
        });
      },
    }),
    expo(),
  ],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];

// Helper for the sign-in / sign-up pages to know whether to render the
// "Continue with Google" button.
export const socialProvidersConfigured = {
  google: !!process.env.GOOGLE_CLIENT_ID,
};
