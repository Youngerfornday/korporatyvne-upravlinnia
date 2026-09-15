#!/usr/bin/env node
/**
 * npm run lint:typography — перевірка української типографіки в content/ (YAML і MDX):
 * апостроф ’, лапки «» і „“, нерозривні пробіли після №, ст. і однолітерних слів, тире.
 * Код 1, якщо є порушення. Потребує Node ≥ 22.18 (імпорт .ts без збірки).
 * Аргументи: шляхи до файлів або каталогів (типово — content/); --nbsp вимагає нерозривні пробіли й у джерелі.
 */
import { readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursively } from './dist-rules.mjs';
import { formatFindings, lintMdx, lintYaml } from './typography-rules.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const CHECKED_EXTENSIONS = new Set(['.yaml', '.yml', '.mdx', '.md']);

function collectFiles(targets) {
  return targets.flatMap((target) => {
    const path = resolve(ROOT, target);
    try {
      return listFilesRecursively(path);
    } catch {
      return [path];
    }
  });
}

function lintFile(file, options) {
  const source = readFileSync(file, 'utf8');
  const extension = extname(file);
  return extension === '.mdx' || extension === '.md' ? lintMdx(source, options) : lintYaml(source, options);
}

function main() {
  const args = process.argv.slice(2);
  const options = { nbsp: args.includes('--nbsp') };
  const targets = args.filter((arg) => !arg.startsWith('--'));
  const files = collectFiles(targets.length > 0 ? targets : ['content']).filter((file) => CHECKED_EXTENSIONS.has(extname(file)));
  const report = files.flatMap((file) => {
    const findings = lintFile(file, options);
    return findings.length > 0 ? formatFindings(relative(ROOT, file), findings) : [];
  });

  if (report.length > 0) {
    console.error(`lint:typography: знайдено порушень — ${report.length}:`);
    for (const line of report) console.error(line);
    console.error('\nПідказка: ⍽ позначає нерозривний пробіл. Правила — src/lib/typography/normalize.ts.');
    process.exit(1);
  }
  console.log(`lint:typography: гаразд — перевірено файлів: ${files.length}.`);
}

main();
