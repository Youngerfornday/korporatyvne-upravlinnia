#!/usr/bin/env node
/**
 * Готує каталог банків для перевірки імпорту: тренувальні фікстури як є, їхні контрольні двійники
 * (`kind: control`, canary, ID `tNN-kNNN`) і контрольний банк підсумкового пулу (`pool: final`,
 * ID зсунуті на 500). Потрібно, щоб import-check міг імпортувати все це в один курс і довести, що
 * випадковий вибір за категорією й тегом не змішує ні види банків, ні пули тестів.
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
  const controlId = (id) => id.replace('-q', '-k');
  /** Підсумковий пул повторює теми, але має власні ID: tNN-k001 → tNN-k501. */
  const finalId = (id) => controlId(id).replace(/-k(\d{3})$/, (_match, number) => `-k${String(Number(number) + 500).padStart(3, '0')}`);

  for (const [prefix, pool, mapId] of [
    ['control', 'module', controlId],
    ['final', 'final', finalId],
  ]) {
    const control = {
      ...bank,
      kind: 'control',
      pool,
      canary: CANARY,
      questions: bank.questions.map((question) => ({ ...question, id: mapId(question.id) })),
    };
    await writeFile(join(target, `${prefix}-${name}`), stringify(control), 'utf8');
  }
}

console.log(`Банки для перевірки: ${names.length} тренувальних, ${names.length} контрольних модульних і ${names.length} контрольних підсумкових у ${target}`);
