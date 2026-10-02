import path from 'node:path';
import { defineConfig } from 'vitest/config';

const admin = path.resolve(import.meta.dirname, '../../apps/admin');
export default defineConfig({
  resolve: {
    alias: {
      '@': admin,
      'server-only': path.resolve(import.meta.dirname, 'test/helpers/server-only.ts'),
      'next/headers': path.join(admin, 'node_modules/next/headers.js'),
      'next/navigation': path.join(admin, 'node_modules/next/navigation.js'),
      'next/cache': path.join(admin, 'node_modules/next/cache.js'),
    },
  },
  test: { include: ['test/admin-server-gates.spec.ts'], environment: 'node', maxWorkers: 1 },
});
