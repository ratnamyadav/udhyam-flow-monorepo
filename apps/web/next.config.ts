import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the monorepo-root .env so apps/web inherits the same DATABASE_URL +
// BETTER_AUTH_* vars that drizzle-kit uses. Next loads .env from cwd by default,
// but in a turborepo we want a single source of truth at the workspace root.
loadEnvConfig(path.resolve(__dirname, '../..'));

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@udyamflow/api',
    '@udyamflow/auth',
    '@udyamflow/db',
    '@udyamflow/tokens',
    '@udyamflow/ui',
  ],
  experimental: {
    optimizePackageImports: ['@udyamflow/ui'],
  },
};

export default config;
