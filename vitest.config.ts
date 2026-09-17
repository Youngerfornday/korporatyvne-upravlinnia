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
      // Точки входу пакетів SCORM працюють лише в браузері: їх перевіряють збірка (tools/export/scorm/build.test.ts)
      // і прохід у Moodle (tools/moodle/scorm-check.sh), а не модульні тести.
      exclude: ['**/*.test.ts', '**/*.test.mjs', '**/*.md', '**/__fixtures__/**', 'tools/checks/check-dist.mjs', 'tools/checks/content-lint.mjs', 'tools/export/scorm/app/*.tsx'],
      reporter: ['text', 'html'],
      thresholds: {
        ...thresholds,
        'src/engines/progress/**': { ...thresholds, perFile: true },
      },
    },
  },
});
