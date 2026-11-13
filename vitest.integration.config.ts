import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { ISOLATED_TEST_PROVIDER_ENV } from './tests/support/test-provider-env.ts';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    maxWorkers: 1,
    env: { ...ISOLATED_TEST_PROVIDER_ENV },
  },
});
