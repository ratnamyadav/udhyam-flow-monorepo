import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { withSentryConfig } from '@sentry/nextjs';
import { getServerEnv } from '@udyamflow/env/server';
import type { NextConfig } from 'next';

loadEnvConfig(path.resolve(__dirname, '../..'));

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
    '@udyamflow/notifications',
    '@udyamflow/storage',
    '@udyamflow/tokens',
    '@udyamflow/ui',
  ],
};

export default withSentryConfig(config, {
  silent: true,
  disableLogger: true,
  widenClientFileUpload: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
