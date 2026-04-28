// Shared BetterAuth server. The Next.js apps re-export the handler at
// `app/api/auth/[...all]/route.ts`; the Expo app talks to it over HTTP.

import { expo } from '@better-auth/expo';
import { db } from '@udyamflow/db';
import * as schema from '@udyamflow/db/schema';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins/organization';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

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
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  trustedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'udyamflow://'],
  plugins: [organization(), expo()],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
