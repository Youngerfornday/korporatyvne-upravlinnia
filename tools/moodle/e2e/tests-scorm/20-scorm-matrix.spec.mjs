// Пакет SCORM «Матриця моделей» у Moodle 5.2.2: студент проходить навчальну й оцінювану спроби, бал і статус
// потрапляють у треки SCORM і журнал оцінок (категорія з вагою 0), а після виходу й повторного входу тренажер
// відновлює стан із cmi.suspend_data. Курс і тренажер готує ../../scorm-check.sh.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { MOODLE_DIR, OUT_DIR } from '../lib/config.mjs';
import { login, saveEvidence, shot } from '../lib/moodle.mjs';

const SHORTNAME = process.env.KU_SCORM_SHORTNAME ?? 'KU-SCORM-CHECK';
const WORK_DIR = resolve(OUT_DIR, 'scorm-check');
const CONTAINER_HELPER = '/tmp/ku-scorm/scorm-helper.php';
const HELPER_TIMEOUT_MS = 120 * 1000;
/** Скільки формулювань першої ознаки оцінюваної спроби навмисно зіставити неправильно. */
const WRONG_IN_GRADED = 2;
const ACTIVITY_ID = 'p01-model-matrix';

const evidence = { startedAt: new Date().toISOString(), screenshots: [] };
const flat = (text) => text.replace(/\s+/g, ' ').trim();

function scormHelper(command, args = {}) {
  const cliArgs = Object.entries(args).map(([key, value]) => `--${key}=${value}`);
  const output = execFileSync('docker', [
    'compose', '--project-directory', MOODLE_DIR, '-f', resolve(MOODLE_DIR, 'compose.yaml'),
    '--env-file', resolve(MOODLE_DIR, 'env/verify.env'),
    'exec', '-T', 'moodle', 'php', CONTAINER_HELPER, command, ...cliArgs,
  ], { encoding: 'utf8', timeout: HELPER_TIMEOUT_MS });
  return JSON.parse(output.slice(output.indexOf('{')));
}

/** Звіт без повного suspend_data: у доказах лишаються довжина, спосіб кодування і запис тренажера. */
function studentReport() {
  const report = scormHelper('report', { shortname: SHORTNAME, username: 'student1' });
  const json = report.suspendData?.json ?? null;
  return {
    ...report,
    suspendData: report.suspendData && {
      length: report.suspendData.length,
      compressed: report.suspendData.compressed,
      activity: json?.activities?.[ACTIVITY_ID] ?? null,
      xp: json?.xp ?? null,
      recentEvents: json?.recentEventIds?.length ?? null,
    },
  };
}

async function snap(page, name) {
  await shot(page, name);
  evidence.screenshots.push(`out/screens/${name}.png`);
}

async function openTrainer(page, cmid) {
  await page.goto(`/mod/scorm/view.php?id=${cmid}`, { waitUntil: 'networkidle' });
  const frame = page.frameLocator('#scorm_object');
  await expect(frame.locator('html[data-scorm="lms"]')).toHaveCount(1);
  await expect(frame.locator('[data-matrix]')).toBeVisible();
  return frame;
}

/** Правильні відповіді — з даних, вбудованих у сам пакет (та сама типографіка, що на картках). */
async function matrixKey(frame) {
  const data = JSON.parse((await frame.locator('#ku-scorm-data').textContent()) ?? '{}');
  const titles = new Map(data.matrix.models.map((model) => [model.id, flat(model.title)]));
  const byStatement = new Map(data.matrix.features.flatMap((feature) => feature.cells.map((cell) => [flat(cell.statement), titles.get(cell.model)])));
  return { byStatement, models: [...titles.values()], features: data.matrix.features.length, items: byStatement.size, masteryPercent: data.masteryPercent };
}

async function answerFeature(matrix, key, wrong) {
  const cards = matrix.locator('[data-matrix-card]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const right = key.byStatement.get(flat((await card.locator('.mcard-text').textContent()) ?? ''));
    expect(right, 'формулювання картки є в даних пакета').toBeTruthy();
    const choice = index < wrong ? key.models.find((title) => title !== right) : right;
    await card.locator('select').selectOption({ label: choice });
  }
}

test.describe.serial('SCORM «Матриця моделей» у Moodle 5.2.2', () => {
  const added = JSON.parse(readFileSync(resolve(WORK_DIR, 'add.json'), 'utf8'));
  let key;
  let before;
  let recordedText;

  test.beforeAll(() => {
    evidence.package = { file: 'out/scorm-check/package.zip', bytes: statSync(resolve(WORK_DIR, 'package.zip')).size };
    evidence.module = added;
  });

  test.afterAll(() => {
    evidence.finishedAt = new Date().toISOString();
    saveEvidence('scorm-check', evidence);
  });

  test('студент: навчальна й оцінювана спроби, бал і статус у треках і журналі оцінок', async ({ page }) => {
    before = studentReport();
    evidence.before = before;
    expect(before.attempts).toBe(0);

    await login(page, 'student1');
    const frame = await openTrainer(page, added.cmid);
    const matrix = frame.locator('[data-matrix]');
    key = await matrixKey(frame);
    expect(key.masteryPercent).toBe(added.masteryscore);
    await expect(matrix).toHaveAttribute('data-stage', 'learning');
    await snap(page, 'scorm-check-1-player-start');

    const initialized = studentReport();
    evidence.afterLaunch = initialized;
    expect(initialized.tracks['cmi.core.lesson_status']).toBe('incomplete');

    for (let feature = 0; feature < key.features; feature += 1) {
      await answerFeature(matrix, key, 0);
      await matrix.locator('[data-matrix-check]').click();
      await expect(matrix.locator('[data-matrix-review]').first()).toBeVisible();
      if (feature < key.features - 1) await matrix.locator('[data-matrix-next]').click();
    }
    await matrix.locator('[data-matrix-finish]').click();
    await expect(matrix).toHaveAttribute('data-stage', 'learning-done');
    await matrix.locator('[data-matrix-start-graded]').click();
    await expect(matrix).toHaveAttribute('data-stage', 'graded');

    for (let feature = 0; feature < key.features; feature += 1) {
      await answerFeature(matrix, key, feature === 0 ? WRONG_IN_GRADED : 0);
      if (feature < key.features - 1) await matrix.locator('[data-matrix-next]').click();
    }
    await matrix.locator('[data-matrix-finish]').click();
    await expect(matrix).toHaveAttribute('data-stage', 'result');
    await expect(frame.locator('[data-matrix-outcome]')).toContainText('XP');
    const right = key.items - WRONG_IN_GRADED;
    const expectedRaw = Math.round((right / key.items) * 10000) / 100;
    evidence.ui = {
      items: key.items,
      features: key.features,
      right,
      percent: await frame.locator('[data-matrix-percent]').textContent(),
      mark: flat((await frame.locator('[data-matrix-mark]').textContent()) ?? ''),
      outcome: flat((await frame.locator('[data-matrix-outcome]').textContent()) ?? ''),
    };
    await snap(page, 'scorm-check-2-graded-result');

    const graded = studentReport();
    evidence.afterGraded = graded;
    expect(graded.attempts).toBe(1);
    expect(Number(graded.tracks['cmi.core.score.raw'])).toBe(expectedRaw);
    expect(graded.tracks['cmi.core.score.min']).toBe('0');
    expect(graded.tracks['cmi.core.score.max']).toBe('100');
    expect(graded.tracks['cmi.core.lesson_status']).toBe(expectedRaw >= key.masteryPercent ? 'passed' : 'failed');
    expect(graded.tracks['cmi.core.exit']).toBe('suspend');
    expect(graded.suspendData.length).toBeLessThanOrEqual(4096);
    expect(graded.suspendData.activity.bestScore).toBeCloseTo(right / key.items, 10);
    expect(graded.grades.scorm).toBe(expectedRaw);
    expect(graded.grades.courseTotal, 'тренажер з вагою 0 не змінює підсумок курсу').toBe(before.grades.courseTotal);

    await page.goto(`/grade/report/user/index.php?id=${added.courseid}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#region-main')).toContainText('SCORM');
    await snap(page, 'scorm-check-3-student-grades');
  });

  test('студент: після виходу й повторного входу стан відновлюється з suspend_data', async ({ page }) => {
    const exited = studentReport();
    evidence.afterExit = exited;
    expect(exited.tracks['cmi.core.exit']).toBe('suspend');

    await login(page, 'student1');
    const frame = await openTrainer(page, added.cmid);
    const matrix = frame.locator('[data-matrix]');
    await expect(matrix).toHaveAttribute('data-stage', 'recorded');
    recordedText = flat((await frame.locator('[data-matrix-recorded-result]').textContent()) ?? '');
    expect(recordedText).toContain(`${key.items - WRONG_IN_GRADED} з ${key.items}`);
    const sco = page.frames().find((candidate) => candidate.url().includes('/mod_scorm/content/'));
    expect(sco, 'кадр SCO плеєра').toBeTruthy();
    const lms = await sco.evaluate(() => ({
      entry: window.parent.API.LMSGetValue('cmi.core.entry'),
      status: window.parent.API.LMSGetValue('cmi.core.lesson_status'),
      suspendLength: window.parent.API.LMSGetValue('cmi.suspend_data').length,
      mode: document.documentElement.dataset.scorm,
      notice: document.getElementById('ku-scorm-notice')?.hidden === false ? document.getElementById('ku-scorm-notice').textContent : null,
    }));
    evidence.reentry = { recordedText, lms, stage: 'recorded' };
    expect(lms.entry).toBe('resume');
    expect(lms.suspendLength).toBe(exited.suspendData.length);
    expect(lms.notice).toBeNull();
    await snap(page, 'scorm-check-4-reentry-restored');

    await page.goto(`/course/view.php?id=${added.courseid}`, { waitUntil: 'networkidle' });
    const reentered = studentReport();
    evidence.afterReentry = reentered;
    expect(reentered.attempts).toBe(1);
    expect(reentered.tracks['cmi.core.score.raw']).toBe(exited.tracks['cmi.core.score.raw']);
    expect(reentered.grades.scorm).toBe(exited.grades.scorm);
  });

  test('викладач: бал студента в журналі оцінок і звіті SCORM', async ({ page }) => {
    await login(page, 'teacher1');
    await page.goto(`/grade/report/grader/index.php?id=${added.courseid}`, { waitUntil: 'networkidle' });
    await snap(page, 'scorm-check-5-teacher-grader');
    await page.goto(`/mod/scorm/report.php?id=${added.cmid}`, { waitUntil: 'networkidle' });
    await snap(page, 'scorm-check-6-teacher-scorm-report');
    const rows = await page.locator('#region-main table tbody tr').allInnerTexts();
    evidence.teacherReport = rows.map(flat).filter((row) => row !== '');
    expect(evidence.teacherReport.join(' ')).toMatch(/Студент/);
  });
});
