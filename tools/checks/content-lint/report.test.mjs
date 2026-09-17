import { describe, expect, it } from 'vitest';
import { exitCode, formatReport } from './report.mjs';

const finding = (patch) => ({
  file: 'content/course.yaml',
  line: 12,
  rule: 'law-number',
  level: 'error',
  message: 'Закон № 590-IX не знайдено',
  hint: 'Додайте акт до бази',
  quote: 'Закон № 590-IX',
  ...patch,
});

describe('formatReport', () => {
  it('reports a clean run', () => {
    expect(formatReport([], { fileCount: 7 })).toEqual(['lint:content: гаразд — перевірено файлів: 7, порушень немає.']);
  });

  it('groups findings by file, counts levels and summarises rules', () => {
    const report = formatReport([finding(), finding({ file: 'content/a.yaml', line: 3, level: 'warning', rule: 'source-unused' })], { fileCount: 2 }).join('\n');
    expect(report).toContain('помилок — 1, попереджень — 1');
    expect(report).toContain('content/a.yaml — 1 знахідка');
    expect(report).toContain('ряд.   12  ПОМИЛКА  [law-number]');
    expect(report).toContain('цитата: «Закон № 590-IX»');
    expect(report).toContain('Підсумок за правилами:');
    expect(report).toContain('--fix-hints');
    expect(report).not.toContain('як виправити:');
  });

  it('prints hints with --fix-hints and marks warnings as errors in strict mode', () => {
    const hints = formatReport([finding()], { fileCount: 1, fixHints: true }).join('\n');
    expect(hints).toContain('як виправити: Додайте акт до бази');
    expect(hints).not.toContain('--fix-hints.');
    const strict = formatReport([finding({ level: 'warning' })], { fileCount: 1, strict: true }).join('\n');
    expect(strict).toContain('ПОМИЛКА');
  });

  it('orders findings on the same line by rule and prints unknown rules as is', () => {
    const report = formatReport([finding({ rule: 'zz-custom' }), finding({ rule: 'checked-date' })], { fileCount: 1 });
    const lines = report.filter((line) => line.includes('ряд.'));
    expect(lines[0]).toContain('[checked-date]');
    expect(report.join('\n')).toContain('— zz-custom');
  });

  it('declines the word «знахідка» by count', () => {
    const many = Array.from({ length: 5 }, () => finding());
    expect(formatReport(many, { fileCount: 1 }).join('\n')).toContain('5 знахідок');
    expect(formatReport(many.slice(0, 2), { fileCount: 1 }).join('\n')).toContain('2 знахідки');
  });
});

describe('exitCode', () => {
  it('fails on errors, passes on warnings, obeys --strict and --warn-only', () => {
    expect(exitCode([finding()])).toBe(1);
    expect(exitCode([finding({ level: 'warning' })])).toBe(0);
    expect(exitCode([finding({ level: 'warning' })], { strict: true })).toBe(1);
    expect(exitCode([finding()], { warnOnly: true })).toBe(0);
    expect(exitCode([])).toBe(0);
  });
});
