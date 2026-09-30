import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { withSentryConfig } from '@sentry/nextjs';
import { getServerEnv } from '@udyamflow/env/server';
import type { NextConfig } from 'next';

// Load the monorepo-root .env so apps/web inherits the same DATABASE_URL +
// BETTER_AUTH_* vars that drizzle-kit uses. Next loads .env from cwd by default,
// but in a turborepo we want a single source of truth at the workspace root.
loadEnvConfig(path.resolve(__dirname, '../..'));

// Validate every required env var at boot — a missing DATABASE_URL or
// BETTER_AUTH_SECRET should crash here with a readable error instead of
// blowing up in a request handler later.
// Skip the check inside Next's static-page collection workers — those spawn
// separate processes without inheriting parent env, and the actual runtime
// requests will validate on the real server path.
if (!process.env.NEXT_PHASE?.includes('page-data')) {
  try {
    getServerEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV !== 'production') throw err;
  }
}

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@udyamflow/api',
    '@udyamflow/auth',
    '@udyamflow/db',
    '@udyamflow/env',
    '@udyamflow/storage',
    '@udyamflow/tokens',
    '@udyamflow/ui',
  ],
  experimental: {
    optimizePackageImports: ['@udyamflow/ui'],
  },
};

// withSentryConfig is a no-op at runtime when SENTRY_DSN is unset. We only
// enable source-map upload when SENTRY_AUTH_TOKEN is also present — that's
// the secret required by Sentry's CLI to upload artifacts during build.
export default withSentryConfig(config, {
  silent: true,
  disableLogger: true,
  widenClientFileUpload: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Skip Sentry instrumentation tooling work when not configured — keeps
  // build clean for contributors without Sentry credentials.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
