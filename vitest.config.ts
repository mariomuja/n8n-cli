import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/n8n-client.ts'],
      exclude: ['src/**/*.d.ts', '**/node_modules/**', 'src/cli.ts', 'src/deploy-one.ts'],
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 95,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      'n8n-client': resolve(__dirname, 'src/n8n-client.ts'),
    },
  },
});
