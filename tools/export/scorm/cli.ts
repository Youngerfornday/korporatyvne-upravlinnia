import { rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatSize } from '../downloads-bundle.ts';
import { buildScormPackages, type BuildScormOptions, type ScormPackagesIndex } from './build.ts';

/**
 * npm run export:scorm — пакети SCORM 1.2 тренажерів для модуля «Пакет SCORM» у Moodle.
 *   --out <каталог>  куди писати ZIP і scorm.json (типово dist-export/scorm; каталог спершу очищується)
 * На сайт пакети потрапляють через npm run build:downloads (public/downloads/scorm/ + маніфест).
 * Код 0 — готово; 1 — помилка збірки; 2 — неправильні аргументи.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const USAGE = 'Використання: npm run export:scorm -- [--out <каталог>]';

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export type ScormBuilder = (options: BuildScormOptions) => Promise<ScormPackagesIndex>;

export async function runScormCli(argv: readonly string[], io: CliIo, cwd: string = process.cwd(), builder: ScormBuilder = buildScormPackages): Promise<number> {
  let values: { out?: string | undefined; help?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args: [...argv], options: { out: { type: 'string' }, help: { type: 'boolean', short: 'h' } }, strict: true, allowPositionals: false }));
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr(USAGE);
    return 2;
  }
  if (values.help === true) {
    io.stdout(USAGE);
    return 0;
  }
  const outDir = values.out === undefined ? join(ROOT, 'dist-export/scorm') : resolve(cwd, values.out);
  try {
    await rm(outDir, { recursive: true, force: true });
    const index = await builder({ root: ROOT, outDir });
    io.stdout(`Пакети SCORM 1.2 (${index.packages.length}) → ${relative(cwd, outDir) || outDir}`);
    for (const entry of index.packages) {
      io.stdout(`  ${entry.file.padEnd(40)} ${formatSize(entry.bytes).padStart(9)}  прохідний ${entry.masteryPercent}  ${entry.title}`);
    }
    return 0;
  } catch (error) {
    io.stderr('Пакети SCORM не зібрано:');
    for (const line of (error instanceof Error ? error.message : String(error)).split('\n')) io.stderr(`  ${line}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runScormCli(process.argv.slice(2), {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  });
}
