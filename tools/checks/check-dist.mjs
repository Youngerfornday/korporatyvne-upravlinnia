#!/usr/bin/env node
/**
 * npm run check:dist — перевірка після збірки:
 *  (а) у dist немає href/src/url() від кореня домену без base;
 *  (б) ні в репозиторії (крім node_modules), ні в dist немає маркера canary контрольних банків.
 * Файли репозиторію беруться з git (відстежувані + нові неігноровані): саме вони можуть потрапити в публічний репо.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { containsCanary, findUnbasedReferences, listFilesRecursively, normalizeBase } from './dist-rules.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const DIST = resolve(ROOT, 'dist');
const LINK_CHECKED_EXTENSIONS = new Set(['.html', '.css']);
const REPO_EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

async function readBase() {
  const { default: config } = await import(pathToFileURL(resolve(ROOT, 'astro.config.mjs')).href);
  return normalizeBase(config.base);
}

function listRepoFiles() {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return output
      .split('\0')
      .filter((file) => file !== '' && !file.split('/').includes('node_modules'))
      .map((file) => resolve(ROOT, file));
  } catch (error) {
    console.warn(`git недоступний (${error.message}); сканую робочий каталог повністю, крім node_modules.`);
    return listFilesRecursively(ROOT, REPO_EXCLUDED_DIRECTORIES);
  }
}

/** Файл, відстежуваний git, але видалений у робочому каталозі, пропускаємо; інші помилки читання — фатальні. */
function readIfExists(file) {
  try {
    return readFileSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function checkDist(base) {
  const problems = [];
  for (const file of listFilesRecursively(DIST)) {
    const content = readFileSync(file);
    const shown = relative(ROOT, file);
    if (containsCanary(content)) problems.push(`${shown}: знайдено маркер контрольного canary`);
    if (!LINK_CHECKED_EXTENSIONS.has(extname(file))) continue;
    for (const { attribute, value } of findUnbasedReferences(content.toString('utf8'), base)) {
      problems.push(`${shown}: ${attribute}="${value}" без base ${base}`);
    }
  }
  return problems;
}

function checkRepo() {
  return listRepoFiles()
    .filter((file) => containsCanary(readIfExists(file) ?? Buffer.alloc(0)))
    .map((file) => `${relative(ROOT, file)}: знайдено маркер контрольного canary`);
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('Каталог dist не знайдено. Спершу виконайте npm run build.');
    process.exit(1);
  }
  const base = await readBase();
  const problems = [...checkDist(base), ...checkRepo()];

  if (problems.length > 0) {
    console.error(`check:dist: знайдено проблем — ${problems.length}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nВнутрішні посилання будуйте через url() із src/lib/url.ts; контрольні банки зберігаються лише в приватному репозиторії.');
    process.exit(1);
  }
  console.log(`check:dist: гаразд — посилання в dist містять base ${base}, маркер canary не знайдено.`);
}

await main();
