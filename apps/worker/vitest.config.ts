import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    name: '@edi-platform/worker',
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
