// Перевірки відновленого курсу KU-RESTORE у браузері (викладач teacher1 і студент student1, мова uk).
import { test, expect } from '@playwright/test';
import { COURSES, EXPECTED_SLOT_POOLS, FIXTURES_DIR, NAMES, QUESTION_MARKERS } from '../lib/config.mjs';
import { helper, login, saveEvidence, sesskey, shot, submitAndWait, uploadWithFilepicker } from '../lib/moodle.mjs';

const PREVIEW_ROUNDS = 6;
const evidence = {};

function identifyQuestion(text) {
  const match = QUESTION_MARKERS.find(([marker]) => text.includes(marker));
  return match ? match[1] : `UNKNOWN: ${text.slice(0, 60)}`;
}

function moduleByName(course, name) {
  const cm = course.modules.find((m) => m.name === name);
  if (!cm) {
    throw new Error(`Module not found: ${name}`);
  }
  return cm;
}

test.describe.serial('restored course KU-RESTORE', () => {
  let course;

  test.beforeAll(() => {
    course = helper('inspect', { shortname: COURSES.main.shortname });
  });

  test.afterAll(() => {
    saveEvidence('verify-course-checks', evidence);
  });

  test('sections and activities are visible to the student', async ({ page }) => {
    await login(page, 'student1');
    await page.goto(`/course/view.php?id=${course.courseid}`, { waitUntil: 'networkidle' });
    for (const section of course.sections.filter((s) => s.section > 0)) {
      await expect(page.locator('#region-main').getByRole('heading', { name: section.name })).toBeVisible();
    }
    for (const cm of course.modules.filter((m) => !['qbank', 'forum'].includes(m.modname))) {
      await expect(page.locator(`#region-main li.activity[data-id="${cm.cmid}"]`)).toBeVisible();
    }
    const qbankOnPage = await page.locator('#region-main li.activity.modtype_qbank').count();
    evidence.sections = { names: course.sections.map((s) => s.name), qbankVisibleToStudent: qbankOnPage };
    await shot(page, 'course-1-student-view');
  });

  test('book chapters render SVG images', async ({ page }) => {
    await login(page, 'student1');
    await page.goto(`/mod/book/view.php?id=${course.book.cmid}`, { waitUntil: 'networkidle' });
    const img = page.locator('img[data-spike="svg-img"]').first();
    await expect(img).toBeVisible();
    const chapter1 = await img.evaluate((el) => ({ src: el.src, naturalWidth: el.naturalWidth, complete: el.complete }));
    const svgResponse = await page.request.get(chapter1.src);
    await shot(page, 'book-1-chapter1');

    // Посилання між главами переписане імпортом на view.php?chapterid=...
    await submitAndWait(page, page.locator('.book_content a', { hasText: 'моделі корпоративного управління' }));
    const img2 = page.locator('img[data-spike="svg-img"]').first();
    await expect(img2).toBeVisible();
    const chapter2 = {
      url: page.url(),
      naturalWidth: await img2.evaluate((el) => el.naturalWidth),
      inlineSvg: await page.locator('svg[data-spike="svg-inline"]').count(),
    };
    await shot(page, 'book-2-chapter2');

    evidence.book = {
      chapters: course.book.chapters,
      chapter1,
      directSvgRequest: {
        status: svgResponse.status(),
        contentType: svgResponse.headers()['content-type'],
        contentDisposition: svgResponse.headers()['content-disposition'],
      },
      chapter2,
    };
    expect(chapter1.src).toContain('/pluginfile.php/');
    expect(chapter1.naturalWidth).toBeGreaterThan(0);
    expect(chapter2.url).toContain('chapterid=');
    expect(chapter2.naturalWidth).toBeGreaterThan(0);
  });

  test('teacher preview: random slots draw only from category T01 with the slot tag', async ({ page }) => {
    const quiz = moduleByName(course, NAMES.randomQuiz);
    await login(page, 'teacher1');
    await page.goto(`/mod/quiz/view.php?id=${quiz.cmid}`, { waitUntil: 'networkidle' });
    const key = await sesskey(page);
    const rounds = [];
    for (let round = 0; round < PREVIEW_ROUNDS; round += 1) {
      await page.goto(`/mod/quiz/startattempt.php?cmid=${quiz.cmid}&sesskey=${key}&forcenew=1`, { waitUntil: 'networkidle' });
      await expect(page.locator('.que')).toHaveCount(EXPECTED_SLOT_POOLS.length);
      // Питання Cloze не має обгортки .qtext, тому беремо весь блок .formulation кожного слота.
      const texts = await page.locator('.que .formulation').allInnerTexts();
      rounds.push(texts.map(identifyQuestion));
      if (round === 0) {
        await shot(page, 'quiz-1-teacher-preview');
      }
    }
    const seenPerSlot = EXPECTED_SLOT_POOLS.map((_, slot) => [...new Set(rounds.map((r) => r[slot]))].sort());
    evidence.randomPreview = { rounds, seenPerSlot, filters: course.quizzes[NAMES.randomQuiz].randomslots };
    seenPerSlot.forEach((seen, slot) => {
      seen.forEach((idnumber) => expect(EXPECTED_SLOT_POOLS[slot]).toContain(idnumber));
    });
  });

  test('student: decimal comma accepted in uk, right answers hidden until the quiz closes', async ({ page }) => {
    const quiz = moduleByName(course, NAMES.finalQuiz);
    await login(page, 'student1');
    await page.goto(`/mod/quiz/view.php?id=${quiz.cmid}`, { waitUntil: 'networkidle' });
    const key = await sesskey(page);
    await page.goto(`/mod/quiz/startattempt.php?cmid=${quiz.cmid}&sesskey=${key}`, { waitUntil: 'networkidle' });

    await page.locator('.que.numerical input[type=text]').fill('1,5');
    const cloze = page.locator('.que.multianswer');
    await cloze.locator('select').first().selectOption({ label: 'є' });
    const clozeInputs = cloze.locator('input[type=text]');
    await clozeInputs.nth(0).fill('10,5');
    await clozeInputs.nth(1).fill('наглядова рада');
    await shot(page, 'quiz-2-student-attempt');

    await submitAndWait(page, page.locator('.mod_quiz-next-nav'));
    await page.locator('#frm-finishattempt button, .btn-finishattempt button').first().click();
    await submitAndWait(page, page.locator('.modal.show').getByRole('button', { name: 'Відправити все та завершити' }));
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/mod/quiz/review.php');
    const reviewUrl = page.url();

    const whileOpen = {
      rightAnswerBlocks: await page.locator('.que .rightanswer').count(),
      correctnessIcons: await page.locator('.que .questioncorrectnessicon, .que .icon.fa-check, .que .icon.fa-xmark').count(),
      gradeTexts: await page.locator('.que .grade').allInnerTexts(),
    };
    await shot(page, 'quiz-3-review-while-open');

    const results = helper('user-results', { shortname: COURSES.main.shortname, username: 'student1' });
    helper('close-quiz', { shortname: COURSES.main.shortname, quiz: NAMES.finalQuiz });

    await page.goto(reviewUrl, { waitUntil: 'networkidle' });
    const afterClose = {
      rightAnswerBlocks: await page.locator('.que .rightanswer').count(),
      rightAnswerTexts: await page.locator('.que .rightanswer').allInnerTexts(),
    };
    await shot(page, 'quiz-4-review-after-close');

    evidence.finalQuiz = { whileOpen, afterClose, attempt: results.attempts.find((a) => a.quiz === NAMES.finalQuiz) };
    evidence.gradesAfterQuiz = results.grades;

    const attempt = evidence.finalQuiz.attempt;
    expect(attempt.state).toBe('finished');
    expect(attempt.slots.find((s) => s.qtype === 'numerical').fraction).toBe(1);
    expect(attempt.sumgrades).toBe(attempt.maxsum);
    expect(whileOpen.rightAnswerBlocks).toBe(0);
    expect(afterClose.rightAnswerBlocks).toBeGreaterThan(0);
  });

  test('student: SCORM 1.2 launches and its score reaches the gradebook outside the total', async ({ page }) => {
    const scorm = moduleByName(course, 'Тренажер SCORM (SPIKE)');
    const before = helper('user-results', { shortname: COURSES.main.shortname, username: 'student1' });
    await login(page, 'student1');
    await page.goto(`/mod/scorm/view.php?id=${scorm.cmid}`, { waitUntil: 'networkidle' });
    const sco = page.frameLocator('#scorm_object');
    await expect(sco.locator('#api-status')).toHaveText('LMSInitialize: true', { timeout: 30 * 1000 });
    await sco.locator('#submit-score').click();
    await expect(sco.locator('#result')).toHaveText('Результат збережено: 80');
    await shot(page, 'scorm-1-player');

    const after = helper('user-results', { shortname: COURSES.main.shortname, username: 'student1' });
    await page.goto(`/grade/report/user/index.php?id=${course.courseid}`, { waitUntil: 'networkidle' });
    await shot(page, 'grades-1-student-user-report');

    evidence.scorm = { before: before.grades, after: after.grades };
    expect(after.grades['scorm: Тренажер SCORM (SPIKE)'].final).toBe(80);
    expect(after.grades['course total'].final).toBe(before.grades['course total'].final);
  });

  test('teacher: gradebook setup shows category weights 24/24/12/40 and 0 for trainers', async ({ page }) => {
    await login(page, 'teacher1');
    await page.goto(`/grade/edit/tree/index.php?id=${course.courseid}`, { waitUntil: 'networkidle' });
    await shot(page, 'grades-2-teacher-setup');
    const weights = await page.locator('input[name^="weight_"], input[id^="weight_"]').evaluateAll(
      (els) => els.map((el) => ({ name: el.name, value: el.value })),
    );
    evidence.gradebook = { setupWeightInputs: weights, db: course.gradebook };
    const byName = course.gradebook.categories;
    expect(byName['Практичні роботи'].weight).toBe(24);
    expect(byName['Модульні тести'].weight).toBe(24);
    expect(byName['Кейс-проєкт'].weight).toBe(12);
    expect(byName['Підсумковий тест'].weight).toBe(40);
    expect(byName['Тренажери (поза підсумком)'].weight).toBe(0);
    expect(course.gradebook.coursetotalmax).toBe(100);
  });

  test('teacher: glossary is empty after restore and entries import from XML', async ({ page }) => {
    const glossary = course.glossary;
    await login(page, 'teacher1');
    await page.goto(`/mod/glossary/view.php?id=${glossary.cmid}`, { waitUntil: 'networkidle' });
    await shot(page, 'glossary-1-empty-after-restore');
    const entriesBefore = helper('inspect', { shortname: COURSES.main.shortname }).glossary.entries;

    await page.goto(`/mod/glossary/import.php?id=${glossary.cmid}`, { waitUntil: 'networkidle' });
    await uploadWithFilepicker(page, 'filechoose', `${FIXTURES_DIR}/glossary-entries.xml`);
    await page.locator('#id_dest').selectOption('current');
    await page.locator('#id_catsincl').check();
    await submitAndWait(page, page.locator('#id_submitbutton'));
    await shot(page, 'glossary-2-import-result');
    const importReport = await page.locator('#region-main').innerText();

    await page.goto(`/mod/glossary/view.php?id=${glossary.cmid}`, { waitUntil: 'networkidle' });
    await shot(page, 'glossary-3-after-import');
    const after = helper('inspect', { shortname: COURSES.main.shortname }).glossary;
    const usersVariant = helper('inspect', { shortname: COURSES.withUsers.shortname }).glossary;

    evidence.glossary = { entriesBefore, importReport: importReport.slice(0, 600), after, usersVariantEntries: usersVariant.entries };
    expect(entriesBefore).toBe(0);
    expect(after.entries).toBe(3);
    expect(after.categories).toBe(2);
    expect(usersVariant.entries).toBe(0);
  });
});
