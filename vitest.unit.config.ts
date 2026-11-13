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
    include: ['tests/unit/**/*.test.ts'],
    env: { ...ISOLATED_TEST_PROVIDER_ENV },
  },
});
