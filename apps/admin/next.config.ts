import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

loadEnvConfig(path.resolve(__dirname, '../..'));

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@udyamflow/auth', '@udyamflow/db', '@udyamflow/tokens', '@udyamflow/ui'],
};

export default config;
