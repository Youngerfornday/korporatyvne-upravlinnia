#!/usr/bin/env node
/**
 * Готує каталог банків для перевірки імпорту: тренувальні фікстури як є плюс їхні контрольні двійники
 * (`kind: control`, canary, ID `tNN-kNNN`). Потрібно, щоб import-check міг імпортувати обидва види в один
 * курс і довести, що випадковий вибір за категорією й тегом їх не змішує.
 *
 * Запуск: node tools/export/__fixtures__/make-control-banks.mjs <каталог-призначення>
 *
 * Canary складається під час виконання (як у src/content/schemas/questions.ts і tools/checks/dist-rules.mjs),
 * щоб жоден файл публічного репозиторію не містив маркер цілком.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const SOURCE = fileURLToPath(new URL('./banks/', import.meta.url));
const CANARY = `${['KU', 'CONTROL', 'CANARY', ''].join('-')}fixture`;

const target = process.argv[2];
if (!target) {
  console.error('Використання: node make-control-banks.mjs <каталог-призначення>');
  process.exit(2);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const names = (await readdir(SOURCE)).filter((name) => name.endsWith('.yaml')).sort();
for (const name of names) {
  const source = await readFile(join(SOURCE, name), 'utf8');
  await writeFile(join(target, name), source, 'utf8');

  const bank = parse(source);
  const control = {
    ...bank,
    kind: 'control',
    canary: CANARY,
    questions: bank.questions.map((question) => ({ ...question, id: question.id.replace('-q', '-k') })),
  };
  await writeFile(join(target, `control-${name}`), stringify(control), 'utf8');
}

console.log(`Банки для перевірки: ${names.length} тренувальних і ${names.length} контрольних у ${target}`);
