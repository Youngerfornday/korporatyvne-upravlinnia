// Відновлення зібраного .mbz у порожній курс інстансу verify від імені викладача (editingteacher,
// не адміністратора) через звичайний веб-інтерфейс — так само, як це робитиме викладач eln.
import { expect, test } from '@playwright/test';
import { courseHelper, loadBuildReport, loadPlan, packagePath, TARGET_SHORTNAME } from '../lib/course.mjs';
import { login, saveEvidence, shot, submitAndWait, uploadWithFilepicker, waitFor } from '../lib/moodle.mjs';

const RESTORE_TIMEOUT_MS = 10 * 60 * 1000;
const TARGET_CURRENT_ADDING = '1';
const UPLOAD_ATTEMPTS = 3;

/**
 * Завантаження пакета у форму відновлення. Filepicker перемальовує форму асинхронно і зрідка губить
 * уже обраний файл («Файли не долучено»), тому невдалу спробу повторюємо з чистої сторінки.
 */
async function uploadPackage(page, contextid, file) {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto(`/backup/restorefile.php?contextid=${contextid}`, { waitUntil: 'networkidle' });
    try {
      await uploadWithFilepicker(page, 'backupfilechoose', file);
      return;
    } catch (error) {
      if (attempt >= UPLOAD_ATTEMPTS) throw error;
    }
  }
}

test('викладач відновлює пакет курсу в порожній курс', async ({ page }) => {
  const plan = loadPlan();
  const build = loadBuildReport();
  const before = courseHelper('inspect', { shortname: TARGET_SHORTNAME });
  expect(before.modules.filter((module) => module.modname !== 'forum'), 'курс-ціль має бути порожнім').toEqual([]);

  await login(page, 'teacher1');
  await uploadPackage(page, before.contextid, packagePath());
  await submitAndWait(page, page.locator('#id_submitbutton'));

  // 1. Підтвердження: у «Подробицях курсу» Moodle показує КОРОТКЕ ім'я курсу з копії.
  await expect(page.locator('.backup_progress')).toBeVisible();
  await expect(page.locator('#region-main')).toContainText(plan.course.shortname);
  await shot(page, 'course-restore-1-confirm');
  await submitAndWait(page, page.getByRole('button', { name: 'Продовжити' }));

  // 2. Призначення: викладач бачить лише «Відновити в цей курс» — злиття з порожнім курсом.
  const current = page.locator('.bcs-current-course');
  await expect(current).toBeVisible();
  const newCourseVisible = await page.locator('.bcs-new-course').count();
  await current.locator(`input[name=target][value="${TARGET_CURRENT_ADDING}"]`).check();
  await shot(page, 'course-restore-2-destination');
  await submitAndWait(page, current.locator('input[type=submit]'));

  // 3. Налаштування: у копії без даних користувачів цей рядок або заблокований замком, або його немає зовсім.
  await expect(page.locator('#id_submitbutton')).toBeVisible();
  const usersSetting = {
    lock: await page.locator('#fitem_id_static_setting_root_users .permissionlock').count(),
    editableCheckbox: await page.locator('input[type=checkbox][name=setting_root_users]').count(),
  };
  await submitAndWait(page, page.locator('#id_submitbutton'));

  // 4. Схема -> 5. Огляд -> 6. Виконання. Позначок не знімаємо: інакше не відновиться журнал оцінок.
  await shot(page, 'course-restore-3-schema');
  await submitAndWait(page, page.locator('#id_submitbutton'));
  await submitAndWait(page, page.locator('#id_submitbutton'));

  const startedAt = Date.now();
  const status = await waitFor(
    () => {
      const current = courseHelper('restore-status', { shortname: TARGET_SHORTNAME });
      return current.finished ? current : null;
    },
    { timeoutMs: RESTORE_TIMEOUT_MS, label: `відновлення ${TARGET_SHORTNAME}` },
  );
  const restoreSeconds = Math.round((Date.now() - startedAt) / 1000);

  await page.goto(`/course/view.php?id=${before.courseid}`, { waitUntil: 'networkidle' });
  await shot(page, 'course-restore-4-course');
  const after = courseHelper('inspect', { shortname: TARGET_SHORTNAME });
  saveEvidence('build-verify-restore', { status, restoreSeconds, usersSetting, newCourseVisible, after });

  expect(status.ok, 'відновлення має завершитися успішно').toBe(true);
  expect(usersSetting.editableCheckbox, 'викладач не може вмикати дані користувачів').toBe(0);
  expect(newCourseVisible, 'викладач не може створити новий курс відновленням').toBe(0);

  // Склад курсу має збігтися з тим, що зібрав build-course.php.
  const expected = build.modules.map((module) => module.modname).sort();
  const restored = after.modules.map((module) => module.modname).filter((modname) => modname !== 'forum').sort();
  expect(restored).toEqual(expected);
  expect(after.sections.map((section) => section.name)).toEqual(build.sections.map((section) => section.name));
});
