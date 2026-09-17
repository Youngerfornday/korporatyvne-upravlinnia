// Перевірки відновленого курсу: те, що обіцяє план збирання, має справді працювати в Moodle.
// Очікування беруться з plan.json і build-course.json, тому тест не треба правити після зміни контенту.
import { expect, test } from '@playwright/test';
import {
  courseHelper,
  expectedBloomBalance,
  glossaryPath,
  loadBuildReport,
  loadPlan,
  planActivity,
  TARGET_SHORTNAME,
} from '../lib/course.mjs';
import { login, saveEvidence, sesskey, shot, submitAndWait, uploadWithFilepicker } from '../lib/moodle.mjs';

const evidence = {};
const plan = loadPlan();
const build = loadBuildReport();

function firstBook() {
  const activity = plan.sections.flatMap((section) => section.activities).find((item) => item.type === 'book');
  if (activity === undefined) test.skip(true, 'у курсі немає жодної Книги: не написано жодної лекції');
  return activity;
}

/** Тест модуля, для якого план справді має слоти: саме на ньому перевіряється баланс Блума. */
function filledModuleQuiz() {
  const activity = plan.sections
    .flatMap((section) => section.activities)
    .find((item) => item.type === 'quiz' && item.ref.startsWith('quiz:m') && item.slots.some((slot) => slot.available >= slot.count));
  if (activity === undefined) test.skip(true, 'жоден модульний тест не має наповненого банку');
  return activity;
}

test.describe.serial('відновлений курс', () => {
  let course;

  test.beforeAll(() => {
    course = courseHelper('inspect', { shortname: TARGET_SHORTNAME });
  });

  test.afterAll(() => {
    saveEvidence('build-verify', {
      package: { sections: course.sections.length, modules: course.modules.length },
      planWarnings: plan.warnings,
      buildWarnings: build.warnings,
      checks: evidence,
    });
  });

  test('розділи курсу і елементи видно студентові', async ({ page }) => {
    await login(page, 'student1');
    await page.goto(`/course/view.php?id=${course.courseid}`, { waitUntil: 'networkidle' });
    for (const section of course.sections.filter((item) => item.section > 0)) {
      await expect(page.locator('#region-main').getByRole('heading', { name: section.name })).toBeVisible();
    }
    const visible = course.modules.filter((module) => !['qbank', 'forum'].includes(module.modname));
    for (const module of visible) {
      await expect(page.locator(`#region-main li.activity[data-id="${module.cmid}"]`)).toBeVisible();
    }
    const qbankVisible = await page.locator('#region-main li.activity.modtype_qbank').count();
    await shot(page, 'course-1-student-view');

    evidence.sections = { names: course.sections.map((section) => section.name), activities: visible.length, qbankVisible };
    expect(qbankVisible, 'банк питань не має бути видно студентові').toBe(0);
    expect(course.sections.map((section) => section.name)).toEqual(plan.sections.map((section) => section.name));
  });

  test('Книга теми: глави на місці, схеми SVG показуються', async ({ page }) => {
    const activity = firstBook();
    const book = course.books[activity.name];
    expect(book, `у курсі немає Книги «${activity.name}»`).toBeTruthy();

    await login(page, 'student1');
    await page.goto(`/mod/book/view.php?id=${book.cmid}`, { waitUntil: 'networkidle' });
    await shot(page, 'book-1-chapter1');
    const toc = await page.locator('.book_toc a, .book_toc li').count();

    // Глава зі схемою: відкриваємо її через зміст і перевіряємо, що зображення справді завантажилось.
    const withImage = activity.expectedChapters.findIndex((_, index) => index > 0);
    await page.goto(`/mod/book/view.php?id=${book.cmid}&chapterid=${await firstChapterWithImage(page, book.cmid)}`, {
      waitUntil: 'networkidle',
    });
    const image = page.locator('.book_content img').first();
    await expect(image).toBeVisible();
    const rendered = await image.evaluate((element) => ({ src: element.src, naturalWidth: element.naturalWidth }));
    await shot(page, 'book-2-scheme');

    evidence.book = { name: activity.name, chapters: book.chapters, images: book.images, toc, rendered, withImage };
    expect(book.chapters).toEqual(activity.expectedChapters);
    expect(book.images.length, 'схеми теми мають лежати файлами глави').toBeGreaterThan(0);
    expect(rendered.src).toContain('/pluginfile.php/');
    expect(rendered.naturalWidth, 'SVG-схема має відобразитися, а не лишитися порожньою').toBeGreaterThan(0);
  });

  test('Сторінка теми з результатами навчання і посилання на сайт', async ({ page }) => {
    const pageActivity = plan.sections.flatMap((section) => section.activities).find((item) => item.type === 'page' && item.ref.startsWith('page:t'));
    const urlActivity = plan.sections.flatMap((section) => section.activities).find((item) => item.type === 'url' && item.ref.startsWith('url:t'));
    if (pageActivity === undefined || urlActivity === undefined) test.skip(true, 'немає опублікованих тем');

    await login(page, 'student1');
    const restored = course.pages[pageActivity.name];
    expect(restored, `немає Сторінки «${pageActivity.name}»`).toBeTruthy();
    await page.goto(`/mod/page/view.php?id=${restored.cmid}`, { waitUntil: 'networkidle' });
    await expect(page.locator('#region-main')).toContainText('Що ви зможете після теми');
    await expect(page.locator('#region-main')).toContainText('Завдання для самостійної роботи');
    await shot(page, 'page-1-topic-outcomes');

    evidence.page = { name: pageActivity.name, urls: course.urls };
    expect(course.urls[urlActivity.name]).toBe(urlActivity.url);
    expect(course.urls[urlActivity.name]).toContain(plan.site);
  });

  test('завдання практичних: рубрика з критеріями і дробовими балами', async () => {
    const assigns = plan.sections
      .flatMap((section) => section.activities)
      .filter((item) => item.type === 'assign' && item.rubric !== undefined);
    expect(assigns.length, 'у плані мають бути завдання з рубриками').toBeGreaterThan(0);

    const compared = assigns.map((activity) => {
      const restored = course.assigns[activity.name];
      const expectedCriteria = Object.fromEntries(
        activity.rubric.criteria.map((criterion) => [criterion.title, criterion.levels.map((level) => level.points).sort((a, b) => a - b)]),
      );
      const actualCriteria = Object.fromEntries(
        Object.entries(restored?.criteria ?? {}).map(([title, scores]) => [title, [...scores].sort((a, b) => a - b)]),
      );
      return { name: activity.name, grade: activity.grade, method: restored?.method, status: restored?.status, expectedCriteria, actualCriteria };
    });
    evidence.assigns = compared;

    for (const item of compared) {
      expect(item.method, `${item.name}: оцінювання має бути за рубрикою`).toBe('rubric');
      expect(item.status, `${item.name}: рубрика має бути готова (статус 20)`).toBe(20);
      expect(item.actualCriteria, `${item.name}: критерії й бали рівнів мають збігатися з реєстром`).toEqual(item.expectedCriteria);
    }
  });

  test('модульний тест: 15 випадкових питань з балансом рівнів Блума', async ({ page }) => {
    const activity = filledModuleQuiz();
    const quiz = course.quizzes[activity.name];
    const plannedSlots = activity.slots.reduce((total, slot) => total + slot.count, 0);

    // Фільтри слотів після відновлення: категорія свого банку і тег рівня Блума.
    const byTag = quiz.randomslots.reduce((counts, slot) => {
      const tag = slot.tags[0] ?? 'без тегу';
      return { ...counts, [tag]: (counts[tag] ?? 0) + 1 };
    }, {});

    await login(page, 'student1');
    await page.goto(`/mod/quiz/view.php?id=${quiz.cmid}`, { waitUntil: 'networkidle' });
    await startAttempt(page, quiz.cmid);
    await expect(page.locator('.que').first()).toBeVisible();
    await shot(page, 'quiz-1-student-attempt');

    // Питання по одному на сторінку, тому спробу завершуємо зі сторінки підсумку.
    const reviewUrl = await finishAttempt(page);

    const drawn = courseHelper('attempt-tags', { shortname: TARGET_SHORTNAME, quiz: activity.name });
    const balance = drawn.questions.reduce((counts, question) => {
      const bloom = question.tags.find((tag) => tag.startsWith('bloom-')) ?? 'без тегу';
      return { ...counts, [bloom]: (counts[bloom] ?? 0) + 1 };
    }, {});

    evidence.moduleQuiz = {
      name: activity.name,
      slots: quiz.slots,
      plannedSlots,
      grade: quiz.grade,
      filters: byTag,
      drawn: drawn.questions.map((question) => ({ idnumber: question.idnumber, category: question.category, tags: question.tags })),
      balance,
      expectedBalance: expectedBloomBalance(plan, activity.ref),
      reviewUrl,
    };

    expect(quiz.slots, 'слотів має бути стільки, скільки в плані').toBe(plannedSlots);
    expect(quiz.randomslots.every((slot) => slot.hasTagFilter), 'кожен слот має фільтр за тегом').toBe(true);
    expect(
      quiz.randomslots.every((slot) => slot.category === activity.slots[0].categoryIdnumber),
      'модульний тест бере питання лише з категорії свого модуля в модульному пулі',
    ).toBe(true);
    expect(drawn.questions.every((question) => question.category.startsWith(`${plan.bank.moduleRoot}-t`))).toBe(true);
    expect(drawn.questions.length, 'спроба має видати всі питання').toBe(plannedSlots);
    expect(balance, 'баланс рівнів Блума в спробі має відповідати плану').toEqual(expectedBloomBalance(plan, activity.ref));
    expect(quiz.timeclose, 'без дати закриття правильні відповіді не відкриються ніколи').toBeGreaterThan(0);
    expect(quiz.timelimit).toBe(activity.timelimit);
    expect(quiz.attempts).toBe(activity.attempts);
  });

  test('правильні відповіді приховані до закриття тесту', async ({ page }) => {
    const activity = filledModuleQuiz();
    const reviewUrl = evidence.moduleQuiz?.reviewUrl;
    expect(reviewUrl, 'спроба тесту має бути виконана попереднім тестом').toBeTruthy();

    await login(page, 'student1');
    await page.goto(reviewUrl, { waitUntil: 'networkidle' });
    const whileOpen = {
      rightAnswerBlocks: await page.locator('.que .rightanswer').count(),
      grades: await page.locator('.que .grade').count(),
    };
    await shot(page, 'quiz-2-review-while-open');

    courseHelper('close-quiz', { shortname: TARGET_SHORTNAME, quiz: activity.name });
    await page.goto(reviewUrl, { waitUntil: 'networkidle' });
    const afterClose = { rightAnswerBlocks: await page.locator('.que .rightanswer').count() };
    await shot(page, 'quiz-3-review-after-close');

    evidence.reviewOptions = { whileOpen, afterClose, reviewrightanswer: course.quizzes[activity.name].reviewrightanswer };
    expect(whileOpen.rightAnswerBlocks, 'до закриття правильних відповідей видно бути не має').toBe(0);
    expect(afterClose.rightAnswerBlocks, 'після закриття правильні відповіді мають з’явитися').toBeGreaterThan(0);
  });

  test('підсумковий тест: слоти за матрицею, лише пул підсумкового тесту, максимум 40', async () => {
    const activity = planActivity(plan, 'quiz:final');
    const quiz = course.quizzes[activity.name];
    const matrixSlots = activity.slots.reduce((total, slot) => total + slot.count, 0);
    // Слот створюється, лише якщо категорія теми вже є в банку; решта — ще не написані питання.
    const fillable = activity.slots.filter((slot) => slot.available > 0);
    const expectedSlots = fillable.reduce((total, slot) => total + slot.count, 0);

    evidence.finalQuiz = {
      name: activity.name,
      matrixSlots,
      expectedSlots,
      restoredSlots: quiz.slots,
      builtSlots: build.activities['quiz:final'].slots,
      missingTopics: [...new Set(activity.slots.filter((slot) => slot.available === 0).map((slot) => slot.categoryIdnumber))],
      grade: quiz.grade,
      timeclose: quiz.timeclose,
      categories: [...new Set(quiz.randomslots.map((slot) => slot.category))],
    };

    expect(matrixSlots, 'матриця курсу розраховує на 40 питань').toBe(40);
    expect(quiz.slots, 'у відновленому тесті — усі слоти, для яких є питання').toBe(expectedSlots);
    expect(quiz.slots, 'відновлення не губить слоти').toBe(build.activities['quiz:final'].slots);
    expect(
      quiz.randomslots.every((slot) => slot.category?.startsWith(`${plan.bank.finalRoot}-`)),
      'підсумковий тест бере питання лише з пулу підсумкового тесту, а не з модульних банків',
    ).toBe(true);
    expect(quiz.randomslots.every((slot) => slot.hasTagFilter)).toBe(true);
    expect(quiz.grade).toBe(activity.grade);
    expect(quiz.timeclose).toBeGreaterThan(0);
    expect(quiz.reviewrightanswer, 'правильні відповіді — лише після закриття').toBe(16);
  });

  test('глосарій: після відновлення порожній, після імпорту XML — записи на місці', async ({ page }) => {
    const file = glossaryPath();
    if (file === null) test.skip(true, 'у пакеті немає glossary.xml');
    const glossary = course.glossary;
    expect(glossary, 'у курсі має бути глосарій').toBeTruthy();

    await login(page, 'teacher1');
    await page.goto(`/mod/glossary/view.php?id=${glossary.cmid}`, { waitUntil: 'networkidle' });
    await shot(page, 'glossary-1-empty-after-restore');
    const before = courseHelper('inspect', { shortname: TARGET_SHORTNAME }).glossary.entries;

    await page.goto(`/mod/glossary/import.php?id=${glossary.cmid}`, { waitUntil: 'networkidle' });
    await uploadWithFilepicker(page, 'filechoose', file);
    await page.locator('#id_dest').selectOption('current');
    await page.locator('#id_catsincl').check();
    await submitAndWait(page, page.locator('#id_submitbutton'));
    await shot(page, 'glossary-2-import-result');

    await page.goto(`/mod/glossary/view.php?id=${glossary.cmid}`, { waitUntil: 'networkidle' });
    await shot(page, 'glossary-3-after-import');
    const after = courseHelper('inspect', { shortname: TARGET_SHORTNAME }).glossary;

    evidence.glossary = { before, after, expected: plan.glossaryImport };
    expect(before, 'резервна копія без користувачів не переносить записи глосарію').toBe(0);
    expect(after.entries).toBe(plan.glossaryImport.entries);
  });

  test('журнал оцінок: категорії з вагами і підсумок 100', async ({ page }) => {
    await login(page, 'teacher1');
    await page.goto(`/grade/edit/tree/index.php?id=${course.courseid}`, { waitUntil: 'networkidle' });
    await shot(page, 'grades-1-teacher-setup');

    const expectedCategories = Object.fromEntries(plan.gradebook.categories.map((category) => [category.name, category.weight]));
    const actualCategories = Object.fromEntries(
      Object.entries(course.gradebook.categories).map(([name, category]) => [name, category.weight]),
    );
    evidence.gradebook = { expected: expectedCategories, actual: course.gradebook };

    expect(actualCategories).toEqual(expectedCategories);
    expect(course.gradebook.coursetotalmax, 'підсумок курсу — 100 балів').toBe(100);
    expect(Object.values(expectedCategories).reduce((total, weight) => total + weight, 0)).toBe(100);
  });
});

/**
 * Завершує спробу: сторінка підсумку → «Надіслати все і завершити» → підтвердження в модальному вікні
 * (у деяких темах його немає, тоді форма відправляється одразу) → сторінка перегляду спроби.
 */
async function finishAttempt(page) {
  const attempt = new URL(page.url()).searchParams.get('attempt');
  await page.goto(`/mod/quiz/summary.php?attempt=${attempt}`, { waitUntil: 'networkidle' });
  await page
    .locator('#frm-finishattempt button, .btn-finishattempt button, form[action*="processattempt.php"] button[type=submit]')
    .first()
    .click();
  const confirm = page.locator('.modal.show .btn-primary, .modal.show button[data-action="save"], .modal.show button[type=submit]');
  await confirm.first().waitFor({ state: 'visible', timeout: 15 * 1000 }).catch(() => null);
  if ((await confirm.count()) > 0) await confirm.first().click();
  await page.waitForURL(/\/mod\/quiz\/review\.php/);
  await page.waitForLoadState('networkidle');
  return page.url();
}

/**
 * Починає спробу тесту переходом на startattempt.php з sesskey — так само, як кнопка форми.
 * Тест з обмеженням часу спершу показує серверну форму підтвердження («Обмеження в часі …
 * Ви впевнені, що хочете почати зараз?»), тому її відправляємо кнопкою «Почати спробу».
 */
async function startAttempt(page, cmid) {
  const key = await sesskey(page);
  await page.goto(`/mod/quiz/startattempt.php?cmid=${cmid}&sesskey=${key}`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/mod/quiz/attempt.php')) {
    await submitAndWait(page, page.locator('#id_submitbutton'));
  }
  await page.waitForURL(/\/mod\/quiz\/attempt\.php/);
}

/** Перша глава Книги, у якій є зображення: саме на ній перевіряється показ схеми. */
async function firstChapterWithImage(page, cmid) {
  const links = await page.locator('.book_toc a').evaluateAll((elements) => elements.map((element) => element.href));
  const ids = links.map((href) => new URL(href).searchParams.get('chapterid')).filter((id) => id !== null);
  for (const id of ids) {
    await page.goto(`/mod/book/view.php?id=${cmid}&chapterid=${id}`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator('.book_content img').count()) > 0) return id;
  }
  return ids[0];
}
