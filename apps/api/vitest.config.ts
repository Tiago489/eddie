import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    name: '@edi-platform/api',
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
