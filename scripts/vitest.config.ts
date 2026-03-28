import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    name: 'scripts',
    root: __dirname,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      '@prisma/client': resolve(__dirname, '../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client'),
      jsonata: resolve(__dirname, '../node_modules/.pnpm/jsonata@2.1.0/node_modules/jsonata'),
    },
  },
});
