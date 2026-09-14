// Конфігурація перевірок: порт і паролі читаються з ../env/verify.env (єдине джерело).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const MOODLE_DIR = resolve(here, '../..');
export const OUT_DIR = resolve(MOODLE_DIR, 'out');
export const SCREEN_DIR = resolve(OUT_DIR, 'screens');
export const RESULTS_DIR = resolve(OUT_DIR, 'playwright-results');
export const FIXTURES_DIR = resolve(MOODLE_DIR, 'fixtures');

function readEnvFile(path) {
  const entries = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]);
  return Object.freeze(Object.fromEntries(entries));
}

const verifyEnv = readEnvFile(resolve(MOODLE_DIR, 'env/verify.env'));

function required(name) {
  const value = process.env[name] ?? verifyEnv[name];
  if (!value) {
    throw new Error(`Missing ${name} in env/verify.env`);
  }
  return value;
}

export const VERIFY_URL = `http://localhost:${required('MOODLE_PORT')}`;
export const USER_PASS = required('SPIKE_USER_PASS');

export const COURSES = Object.freeze({
  main: Object.freeze({ shortname: 'KU-RESTORE', mbz: resolve(OUT_DIR, 'ku-spike-nousers.mbz') }),
  withUsers: Object.freeze({ shortname: 'KU-RESTORE-USERS', mbz: resolve(OUT_DIR, 'ku-spike-users.mbz') }),
});

export const NAMES = Object.freeze({
  randomQuiz: 'Модульний тест 1 (SPIKE)',
  finalQuiz: 'Підсумковий тест (SPIKE)',
});

// Фрагменти текстів питань із fixtures/questions.xml -> idnumber питання.
export const QUESTION_MARKERS = Object.freeze([
  ['агентську проблему', 'SPIKE-T01-Q01'],
  ['Наглядова рада акціонерного товариства здійснює', 'SPIKE-T01-Q02'],
  ['Оберіть дві ознаки', 'SPIKE-T01-Q03'],
  ['Встановіть відповідність', 'SPIKE-T01-Q04'],
  ['15 акціями', 'SPIKE-T01-Q05'],
  ['спрямовано', 'SPIKE-T01-Q06'],
  ['Вищим органом', 'SPIKE-T01-Q07'],
  ['Кейс. На збори', 'SPIKE-T01-Q08'],
  ['емісію акцій', 'SPIKE-T02-Q01'],
  ['порядок виплати дивідендів', 'SPIKE-T02-Q02'],
]);

// Очікуваний склад випадкових слотів: категорія Т01 + тег рівня Блума.
export const EXPECTED_SLOT_POOLS = Object.freeze([
  ['SPIKE-T01-Q01', 'SPIKE-T01-Q02'],
  ['SPIKE-T01-Q03', 'SPIKE-T01-Q04'],
  ['SPIKE-T01-Q05', 'SPIKE-T01-Q06'],
  ['SPIKE-T01-Q07', 'SPIKE-T01-Q08'],
]);

// Очікувані теги питань після відновлення (як у fixtures/questions.xml).
export const EXPECTED_QUESTION_TAGS = Object.freeze({
  'SPIKE-T01-Q01': ['bloom-remember'],
  'SPIKE-T01-Q02': ['bloom-remember'],
  'SPIKE-T01-Q03': ['bloom-understand'],
  'SPIKE-T01-Q04': ['bloom-understand'],
  'SPIKE-T01-Q05': ['bloom-apply'],
  'SPIKE-T01-Q06': ['bloom-apply'],
  'SPIKE-T01-Q07': ['bloom-analyze'],
  'SPIKE-T01-Q08': ['bloom-analyze'],
  'SPIKE-T02-Q01': ['bloom-remember'],
  'SPIKE-T02-Q02': ['bloom-remember'],
});
