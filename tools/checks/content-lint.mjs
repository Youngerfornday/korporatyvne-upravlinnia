#!/usr/bin/env node
/**
 * npm run lint:content — перевірка фактів у content/ проти docs/research/legal-baseline.md:
 * номери законів, коди норм і статті, узгодженість lawRef, заборонена зона «Не підтверджено», дати перевірки,
 * застереження кейсів, джерела, терміни, числа без джерела; для презентацій (slides.yaml) — джерела чисел,
 * коди норм, кейси й схеми теми; для самоперевірок і банків — баланс позицій та довжин відповідей.
 *
 * Аргументи: шляхи до файлів або каталогів (типово — content/).
 * Прапорці: --fix-hints (підказка до кожної знахідки), --strict (попередження = помилки),
 *           --warn-only (завжди код 0: режим для збірки, поки знахідки не виправлено).
 * Код 1 — якщо є помилки. Потребує Node ≥ 22.12.
 */
import { readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBaseline } from './content-lint/baseline.mjs';
import { contentFile } from './content-lint/content.mjs';
import { lintContent } from './content-lint/lint.mjs';
import { exitCode, formatReport } from './content-lint/report.mjs';
import { listFilesRecursively } from './dist-rules.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const BASELINE = 'docs/research/legal-baseline.md';
const COURSE = 'content/course.yaml';
const CHECKED_EXTENSIONS = new Set(['.yaml', '.yml', '.mdx', '.md']);

const USAGE = [
  'Використання: node tools/checks/content-lint.mjs [шляхи…] [--fix-hints] [--strict] [--warn-only]',
  '  шляхи        файли або каталоги (типово — content/)',
  '  --fix-hints  підказка «як виправити» до кожної знахідки',
  '  --strict     попередження рахуються помилками (код 1)',
  '  --warn-only  завжди код 0 (режим збірки, поки знахідки не виправлено)',
].join('\n');

function collectFiles(targets) {
  return targets.flatMap((target) => {
    const path = resolve(ROOT, target);
    try {
      return statSync(path).isDirectory() ? listFilesRecursively(path) : [path];
    } catch {
      throw new Error(`Шлях не знайдено: ${target}`);
    }
  });
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const options = {
    fixHints: argv.includes('--fix-hints'),
    strict: argv.includes('--strict'),
    warnOnly: argv.includes('--warn-only'),
  };
  const targets = argv.filter((argument) => !argument.startsWith('--'));
  const paths = collectFiles(targets.length > 0 ? targets : ['content']).filter((path) => CHECKED_EXTENSIONS.has(extname(path)));
  const files = paths.map((path) => contentFile(relative(ROOT, path), readFileSync(path, 'utf8')));
  const baseline = parseBaseline(readFileSync(resolve(ROOT, BASELINE), 'utf8'));
  const course = files.find((file) => file.file === COURSE)?.data ?? contentFile(COURSE, readFileSync(resolve(ROOT, COURSE), 'utf8')).data;

  const findings = lintContent({ files, baseline, course });
  const report = [
    ...formatReport(findings, { fileCount: files.length, fixHints: options.fixHints, strict: options.strict }),
    ...(targets.length > 0 ? ['', 'Часткова перевірка: правило source-unused бачить лише передані файли — для повної картини запустіть без аргументів.'] : []),
  ];
  const code = exitCode(findings, options);
  const print = code === 0 ? console.log : console.error;
  for (const line of report) print(line);
  if (options.warnOnly && findings.some((finding) => finding.level === 'error')) {
    console.log('\nlint:content: режим --warn-only — помилки не зупиняють збірку. Приберіть прапорець, коли знахідки виправлено.');
  }
  process.exit(code);
}

try {
  main();
} catch (error) {
  console.error(`lint:content: ${error instanceof Error ? error.message : String(error)}`);
  console.error(USAGE);
  process.exit(1);
}
