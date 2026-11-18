import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
    // Each file boots its own PGlite and applies every migration; under
    // parallel load that can exceed the 10s default.
    hookTimeout: 60_000,
  },
});
