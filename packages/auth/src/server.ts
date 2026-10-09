// Shared BetterAuth server. The Next.js apps re-export the handler at
// `app/api/auth/[...all]/route.ts`; the Expo app talks to it over HTTP.

import { expo } from '@better-auth/expo';
import { oauthProvider } from '@better-auth/oauth-provider';
import { db } from '@udyamflow/db';
import * as schema from '@udyamflow/db/schema';
import { sendEmail } from '@udyamflow/notifications';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins/jwt';
import { organization } from 'better-auth/plugins/organization';
import { assertAccountCanBeDeleted } from './account-deletion';
import { createEmailOTP, emailOTPGuard } from './email-otp';
import { validateProductionAuth } from './security';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
validateProductionAuth(process.env);

// AI assistants (Claude, ChatGPT, …) connect to the MCP endpoint with OAuth:
// they register themselves (dynamic client registration), the owner signs in
// and picks a workspace, and the access token is a JWT for this resource
// carrying the workspace id in `org`.
export const MCP_RESOURCE = `${(process.env.NEXT_PUBLIC_APP_URL ?? baseURL).replace(/\/+$/, '')}/api/mcp`;
export const MCP_SCOPES = ['workspace:read', 'workspace:write'] as const;
// BetterAuth's handler lives at /api/auth, which is also the OAuth issuer.
export const AUTH_ISSUER = `${baseURL.replace(/\/+$/, '')}/api/auth`;

// The OAuth provider seeds its resource row while auth initializes. With the
// database unreachable (CI builds, a cold-start blip) that rejects the whole
// auth context, though the plugin re-seeds lazily, with retries, on the first
// OAuth request anyway. So a failed startup seed is logged, not fatal.
// ponytail: the swallowed init also drops the plugin's back-channel logout
// hook for that instance; nothing registers back-channel URIs today.
function tolerantInit<P extends { init?: (ctx: never) => unknown }>(plugin: P): P {
  const init = plugin.init;
  if (!init) return plugin;
  return {
    ...plugin,
    init: async (ctx: never) => {
      try {
        return await init(ctx);
      } catch (err) {
        // `next build` loads auth with a placeholder database; stay quiet there.
        if (process.env.NEXT_PHASE !== 'phase-production-build') {
          console.error(
            '[auth] oauth-provider init failed; will retry on first use:',
            err instanceof Error ? err.message : err,
          );
        }
        return undefined;
      }
    },
  };
}

// Origins allowed to call the auth endpoints (CSRF / origin check). Built
// from env so production domains work: the web app, the admin app, any
// extra comma-separated TRUSTED_ORIGINS, and the mobile deep-link scheme.
const trustedOrigins = [
  baseURL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.ADMIN_APP_URL,
  ...(process.env.TRUSTED_ORIGINS ?? '').split(','),
  'udyamflow://',
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:3001']),
]
  .map((o) => o?.trim())
  .filter((o): o is string => !!o);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createAppAuth(
  database: typeof db,
  deliverOTP?: (email: string, otp: string) => Promise<void>,
  deliverDeletion?: (data: { user: { id: string; email: string }; url: string }) => Promise<void>,
) {
  return betterAuth({
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
        jwks: schema.jwks,
        oauthClient: schema.oauthClient,
        oauthResource: schema.oauthResource,
        oauthClientResource: schema.oauthClientResource,
        oauthRefreshToken: schema.oauthRefreshToken,
        oauthAccessToken: schema.oauthAccessToken,
        oauthConsent: schema.oauthConsent,
        oauthClientAssertion: schema.oauthClientAssertion,
      },
    }),
    emailAndPassword: { enabled: false },
    // The jwt plugin's own /token would mint JWTs for any session; only the
    // OAuth provider should issue tokens.
    disabledPaths: ['/token'],
    hooks: { before: emailOTPGuard(database) },
    // Google sign-in renders only when both client id + secret are set.
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            },
          }
        : undefined,
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await assertAccountCanBeDeleted(database, user.id);
        },
        sendDeleteAccountVerification: async ({ user, url }) => {
          if (deliverDeletion) {
            await deliverDeletion({ user, url });
            return;
          }
          if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
            throw new APIError('SERVICE_UNAVAILABLE', {
              message: 'Account verification email is temporarily unavailable.',
            });
          }
          await sendEmail({
            to: user.email,
            subject: 'Confirm deletion of your UdyamFlow account',
            html: `<p>Confirm deletion of your personal account. Workspace business records are retained.</p><p><a href="${escapeHtml(url)}">Delete my account</a></p>`,
          });
        },
      },
      additionalFields: {
        role: { type: 'string', defaultValue: 'user', input: false },
      },
    },
    trustedOrigins,
    databaseHooks: {
      session: {
        create: {
          // New sessions start in the user's oldest workspace, so tenant
          // calls work straight after sign-in on any device (the org plugin
          // otherwise leaves activeOrganizationId empty).
          before: async (session) => {
            if (session.activeOrganizationId) return { data: session };
            const membership = await database.query.member.findFirst({
              columns: { organizationId: true },
              where: (m, { eq }) => eq(m.userId, session.userId),
              orderBy: (m, { asc }) => [asc(m.createdAt)],
            });
            return {
              data: { ...session, activeOrganizationId: membership?.organizationId ?? null },
            };
          },
        },
      },
    },
    plugins: [
      createEmailOTP(
        deliverOTP ??
          (async (email, otp) => {
            // Never let the development email logger print authentication codes.
            if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
              throw new APIError('SERVICE_UNAVAILABLE', {
                message: 'Email sign-in is temporarily unavailable.',
              });
            }
            await sendEmail({
              to: email,
              subject: 'Your UdyamFlow sign-in code',
              html: `<p>Your sign-in code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes and can only be used once. A new code replaces the old one. If you did not request this, ignore this email.</p>`,
            });
          }),
      ),
      organization({
        sendInvitationEmail: async (data) => {
          const url = `${baseURL}/accept-invitation/${data.id}`;
          const orgName = escapeHtml(data.organization.name);
          const role = escapeHtml(data.role);
          await sendEmail({
            to: data.email,
            subject: `You've been invited to join ${data.organization.name} on UdyamFlow`,
            html: `
            <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;">
              <h2 style="margin:0 0 12px 0;font-weight:500;color:#1a1815;">
                Join ${orgName} on UdyamFlow
              </h2>
              <p style="color:#5e5b54;line-height:1.6;">
                You've been invited as <strong>${role}</strong>. Click below to accept and access the dashboard.
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
      jwt({ jwt: { issuer: AUTH_ISSUER } }),
      tolerantInit(
        oauthProvider({
          loginPage: '/sign-in',
          consentPage: '/oauth/consent',
          scopes: ['openid', 'profile', 'email', 'offline_access', ...MCP_SCOPES],
          allowDynamicClientRegistration: true,
          allowUnauthenticatedClientRegistration: true,
          clientRegistrationDefaultScopes: ['offline_access', ...MCP_SCOPES],
          resources: [MCP_RESOURCE],
          clientRegistrationDefaultResources: [MCP_RESOURCE],
          postLogin: {
            // People in several workspaces choose which one the assistant gets.
            page: '/oauth/workspace',
            shouldRedirect: async ({ user }) => {
              const memberships = await database.query.member.findMany({
                columns: { id: true },
                where: (m, { eq }) => eq(m.userId, user.id),
                limit: 2,
              });
              return memberships.length > 1;
            },
            consentReferenceId: async ({ user, session }) => {
              const orgId = (session as { activeOrganizationId?: string | null })
                .activeOrganizationId;
              const membership =
                orgId &&
                (await database.query.member.findFirst({
                  columns: { id: true },
                  where: (m, { and, eq }) =>
                    and(eq(m.userId, user.id), eq(m.organizationId, orgId)),
                }));
              if (!orgId || !membership) {
                throw new APIError('BAD_REQUEST', {
                  message: 'Set up your workspace in UdyamFlow before connecting an assistant.',
                });
              }
              return orgId;
            },
          },
          customAccessTokenClaims: ({ referenceId }) => (referenceId ? { org: referenceId } : {}),
        }),
      ),
    ],
  });
}

export const auth = createAppAuth(db);
export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];

// Helper for the sign-in / sign-up pages to know whether to render the
// "Continue with Google" button.
export const socialProvidersConfigured = {
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
};
