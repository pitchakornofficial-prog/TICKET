import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { ISOLATED_TEST_PROVIDER_ENV } from './tests/support/test-provider-env.ts';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/benchmarks/**/*.bench.test.ts'],
    testTimeout: 240000,
    hookTimeout: 30000,
    maxWorkers: 1,
    env: { ...ISOLATED_TEST_PROVIDER_ENV, PLAYWRIGHT_BROWSERS_PATH: '.cache/ms-playwright' },
  },
});
