// Дані для перевірки зібраного курсу: шлях до .mbz, план збирання, звіт build-course.php
// і виклик course-helper.php в інстансі verify.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOODLE_DIR, OUT_DIR } from './config.mjs';

const HELPER_TIMEOUT_MS = 180 * 1000;
const CONTAINER_HELPER = '/tmp/ku-verify/course-helper.php';

export const BUILD_DIR = resolve(OUT_DIR, 'build');
export const PACKAGE_DIR = resolve(MOODLE_DIR, '../../dist-export/moodle');
export const TARGET_SHORTNAME = process.env.KU_TARGET_SHORTNAME ?? 'KU-COURSE';

/**
 * Пакет для перевірки: явний KU_MBZ або найсвіжіший за часом зміни .mbz у dist-export/moodle
 * (там можуть лежати обидва варіанти пакета — з контрольним і з тренувальним банком).
 */
export function packagePath() {
  if (process.env.KU_MBZ) return resolve(process.env.KU_MBZ);
  const files = readdirSync(PACKAGE_DIR)
    .filter((name) => name.endsWith('.mbz'))
    .map((name) => resolve(PACKAGE_DIR, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (files.length === 0) throw new Error(`У ${PACKAGE_DIR} немає жодного .mbz — спершу tools/moodle/build-mbz.sh`);
  return files[0];
}

export function glossaryPath() {
  const file = resolve(PACKAGE_DIR, 'glossary.xml');
  return existsSync(file) ? file : null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadPlan() {
  return readJson(resolve(BUILD_DIR, 'plan.json'));
}

export function loadBuildReport() {
  return readJson(resolve(OUT_DIR, 'build-course.json'));
}

/** Виконує course-helper.php у контейнері verify і повертає розібраний JSON. */
export function courseHelper(command, args = {}) {
  const cliArgs = Object.entries(args).map(([key, value]) => `--${key}=${value}`);
  const output = execFileSync('docker', [
    'compose', '--project-directory', MOODLE_DIR, '-f', resolve(MOODLE_DIR, 'compose.yaml'),
    '--env-file', resolve(MOODLE_DIR, 'env/verify.env'),
    'exec', '-T', 'moodle', 'php', CONTAINER_HELPER, command, ...cliArgs,
  ], { encoding: 'utf8', timeout: HELPER_TIMEOUT_MS });
  return JSON.parse(output.slice(output.indexOf('{')));
}

/** Скільки питань кожного рівня Блума очікує план для тесту. */
export function expectedBloomBalance(plan, quizRef) {
  const activity = plan.sections
    .flatMap((section) => section.activities)
    .find((item) => item.ref === quizRef);
  if (activity === undefined) return {};
  return activity.slots.reduce((balance, slot) => ({ ...balance, [slot.tag]: (balance[slot.tag] ?? 0) + slot.count }), {});
}

export function planActivity(plan, ref) {
  return plan.sections.flatMap((section) => section.activities).find((item) => item.ref === ref) ?? null;
}
