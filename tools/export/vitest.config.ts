import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Тести експортерів Moodle: npm run test:export (покриття — npm run test:export:coverage).
 * Окремий конфіг, бо кореневий vitest.config.ts збирає лише src/** і tools/checks/**.
 */
const MIN_COVERAGE = 80;

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tools/export/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['tools/export/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__fixtures__/**', '**/test-support/**', 'tools/export/vitest.config.ts'],
      reportsDirectory: 'coverage/export',
      reporter: ['text', 'html'],
      thresholds: { lines: MIN_COVERAGE, branches: MIN_COVERAGE, functions: MIN_COVERAGE, statements: MIN_COVERAGE },
    },
  },
});
