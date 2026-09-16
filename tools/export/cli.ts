import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { pluralUk } from '../../src/lib/plural.ts';
import { OWNED_FILE, buildExportFiles, type ExportFile } from './export-files.ts';
import { findContentProblems, loadExportContent, type ContentIssue, type ExportSources } from './load.ts';

/**
 * npm run export:moodle — Moodle XML питань і глосарію на модуль і на курс.
 *   --banks <каталог>    банки питань (типово content/banks/training; у приватному репо — контрольні)
 *   --modules <каталог>  теми з glossary.yaml (типово content/modules)
 *   --course <файл>      реєстр курсу (типово content/course.yaml)
 *   --out <каталог>      куди писати (типово dist-export/moodle)
 * Код 0 — файли записано; 1 — помилки валідації (український звіт); 2 — неправильні аргументи.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE =
  'Використання: node --import ./tools/export/register-ts.mjs tools/export/cli.ts [--banks <каталог>] [--modules <каталог>] [--course <файл>] [--out <каталог>]';
const ERROR_FORMS = { one: 'помилку', few: 'помилки', many: 'помилок', other: 'помилки' };
const FILE_FORMS = { one: 'файл', few: 'файли', many: 'файлів', other: 'файлу' };

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

const consoleIo: CliIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

interface CliOptions extends ExportSources {
  readonly outDir: string;
}

function parseOptions(argv: readonly string[], cwd: string): CliOptions | 'help' {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      banks: { type: 'string' },
      modules: { type: 'string' },
      course: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return 'help';
  const path = (value: string | undefined, fallback: string) => (value === undefined ? join(ROOT, fallback) : resolve(cwd, value));
  return {
    banksDir: path(values.banks, 'content/banks/training'),
    modulesDir: path(values.modules, 'content/modules'),
    courseFile: path(values.course, 'content/course.yaml'),
    outDir: path(values.out, 'dist-export/moodle'),
  };
}

/** Шлях відносно поточного каталогу, якщо файл усередині нього; інакше — абсолютний. */
function displayPath(cwd: string, path: string): string {
  const shown = relative(cwd, path);
  return shown === '' ? '.' : shown.startsWith('..') ? path : shown;
}

function report(issues: readonly ContentIssue[], cwd: string, io: CliIo): void {
  io.stderr(`Експорт у Moodle XML зупинено: знайдено ${pluralUk(issues.length, ERROR_FORMS)}.`);
  for (const issue of issues) io.stderr(`  - ${displayPath(cwd, issue.file)}: ${issue.message}`);
}

async function writeExport(outDir: string, files: readonly ExportFile[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const stale = (await readdir(outDir)).filter((name) => OWNED_FILE.test(name));
  await Promise.all(stale.map((name) => rm(join(outDir, name))));
  await Promise.all(files.map((file) => writeFile(join(outDir, file.name), file.contents, 'utf8')));
}

export async function runCli(argv: readonly string[], io: CliIo = consoleIo, cwd: string = process.cwd()): Promise<number> {
  let options: CliOptions | 'help';
  try {
    options = parseOptions(argv, cwd);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr(USAGE);
    return 2;
  }
  if (options === 'help') {
    io.stdout(USAGE);
    return 0;
  }

  z.config(z.locales.uk());
  const { content, issues } = await loadExportContent(options);
  const problems = [...issues, ...(content ? findContentProblems(content) : [])];
  if (!content || problems.length > 0) {
    report(problems, cwd, io);
    return 1;
  }

  let files: ExportFile[];
  try {
    files = buildExportFiles(content);
  } catch (error) {
    report([{ file: options.banksDir, message: error instanceof Error ? error.message : String(error) }], cwd, io);
    return 1;
  }
  await writeExport(options.outDir, files);
  io.stdout(`Moodle XML: ${pluralUk(files.length, FILE_FORMS)} у ${displayPath(cwd, options.outDir)}`);
  for (const file of files) io.stdout(`  ${file.name}`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
