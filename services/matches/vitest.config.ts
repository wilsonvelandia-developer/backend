import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/config.ts', 'src/logger.ts', 'src/db/**'],
    },
  },
  resolve: {
    alias: {
      '@tournament/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
    },
  },
});
