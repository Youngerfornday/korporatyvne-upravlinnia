import { defineConfig } from 'vitest/config';

const MIN_COVERAGE = 80;
const thresholds = {
  lines: MIN_COVERAGE,
  branches: MIN_COVERAGE,
  functions: MIN_COVERAGE,
  statements: MIN_COVERAGE,
};

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/checks/**/*.test.mjs', 'tools/export/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engines', 'src/lib', 'src/content/schemas', 'src/content/integrity', 'tools/checks', 'tools/export'],
      exclude: ['**/*.test.ts', '**/*.test.mjs', '**/*.md', '**/__fixtures__/**', 'tools/checks/check-dist.mjs', 'tools/checks/content-lint.mjs'],
      reporter: ['text', 'html'],
      thresholds: {
        ...thresholds,
        'src/engines/progress/**': { ...thresholds, perFile: true },
      },
    },
  },
});
