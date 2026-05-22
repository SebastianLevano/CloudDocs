import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    // Mirror the path aliases from `tsconfig.base.json` so vitest can resolve
    // workspace libs (`@clouddocs/shared-types`, ...). Without this, vitest
    // tries to load them as published packages and fails.
    alias: {
      '@clouddocs/shared-types': resolve(__dirname, '../../libs/shared-types/src/index.ts'),
      '@clouddocs/shared-utils': resolve(__dirname, '../../libs/shared-utils/src/index.ts'),
      '@clouddocs/ui-tokens': resolve(__dirname, '../../libs/ui-tokens/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/api',
    },
  },
});
