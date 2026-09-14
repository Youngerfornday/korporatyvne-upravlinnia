// Відновлення .mbz у чистий інстанс verify від імені викладача (editingteacher, не адміністратор)
// через звичайний веб-інтерфейс: «Повторне використання курсу» -> «Відновлення».
import { test, expect } from '@playwright/test';
import { COURSES, EXPECTED_QUESTION_TAGS } from '../lib/config.mjs';
import { helper, login, saveEvidence, shot, submitAndWait, uploadWithFilepicker, waitFor } from '../lib/moodle.mjs';

const RESTORE_TIMEOUT_MS = 6 * 60 * 1000;
const TARGET_CURRENT_ADDING = '1';

async function restoreAsTeacher(page, course, prefix) {
  const before = helper('inspect', { shortname: course.shortname });
  // Порожній курс Moodle може мати лише автоматичний форум оголошень.
  expect(before.modules.filter((m) => m.modname !== 'forum'), 'target course must be empty before restore').toEqual([]);

  await login(page, 'teacher1');
  await page.goto(`/backup/restorefile.php?contextid=${before.contextid}`, { waitUntil: 'networkidle' });
  await uploadWithFilepicker(page, 'backupfilechoose', course.mbz);
  await shot(page, `${prefix}-1-uploaded`);
  await submitAndWait(page, page.locator('#id_submitbutton'));

  // 1. Підтвердження.
  await expect(page.locator('.backup_progress')).toBeVisible();
  await shot(page, `${prefix}-2-confirm`);
  await submitAndWait(page, page.getByRole('button', { name: 'Продовжити' }));

  // 2. Призначення: викладач бачить лише «Відновити в цей курс» (об'єднання або заміна вмісту).
  const current = page.locator('.bcs-current-course');
  await expect(current).toBeVisible();
  const newCourseVisible = await page.locator('.bcs-new-course').count();
  await current.locator(`input[name=target][value="${TARGET_CURRENT_ADDING}"]`).check();
  await shot(page, `${prefix}-3-destination`);
  await submitAndWait(page, current.locator('input[type=submit]'));

  // 3. Налаштування: чи дозволено викладачу включати дані користувачів.
  await expect(page.locator('#id_submitbutton')).toBeVisible();
  const usersRow = page.locator('#fitem_id_static_setting_root_users');
  const usersSetting = {
    staticRow: await usersRow.count(),
    permissionLock: await usersRow.locator('.permissionlock').count(),
    hiddenValue: await page.locator('input[type=hidden][name=setting_root_users]').inputValue().catch(() => null),
    editableCheckbox: await page.locator('input[type=checkbox][name=setting_root_users]').count(),
  };
  await shot(page, `${prefix}-4-settings`);
  await submitAndWait(page, page.locator('#id_submitbutton'));

  // 4. Схема -> 5. Огляд -> 6. Виконання.
  await shot(page, `${prefix}-5-schema`);
  await submitAndWait(page, page.locator('#id_submitbutton'));
  await shot(page, `${prefix}-6-review`);
  await submitAndWait(page, page.locator('#id_submitbutton'));
  await shot(page, `${prefix}-7-process`);

  const startedAt = Date.now();
  const status = await waitFor(() => {
    const current = helper('restore-status', { shortname: course.shortname });
    return current.finished ? current : null;
  }, { timeoutMs: RESTORE_TIMEOUT_MS, label: `restore of ${course.shortname}` });
  const restoreSeconds = Math.round((Date.now() - startedAt) / 1000);

  await page.goto(`/course/view.php?id=${before.courseid}`, { waitUntil: 'networkidle' });
  await shot(page, `${prefix}-8-course`);

  const after = helper('inspect', { shortname: course.shortname });
  return { status, restoreSeconds, newCourseVisible, usersSetting, after };
}

test.describe.serial('restore as editingteacher', () => {
  test('backup WITHOUT user data restores fully', async ({ page }) => {
    const result = await restoreAsTeacher(page, COURSES.main, 'restore-nousers');
    saveEvidence('verify-restore-nousers', result);

    expect(result.status.ok).toBe(true);
    expect(result.after.modules.map((m) => m.modname).filter((m) => m !== 'forum').sort()).toEqual(
      ['assign', 'assign', 'book', 'glossary', 'page', 'qbank', 'quiz', 'quiz', 'scorm', 'url'],
    );
    expect(result.after.qbanks[0].questions).toBe(10);
    // Теги рівня Блума мають лишитися на своїх питаннях: від них залежать випадкові слоти тестів.
    expect.soft(result.after.qbanks[0].questiontags).toEqual(EXPECTED_QUESTION_TAGS);
    expect(result.after.book.chapters).toHaveLength(2);
    expect(result.after.book.svgfiles.sort()).toEqual(['agency-scheme.svg', 'models.svg']);
    expect(result.after.glossary.entries).toBe(0);
  });

  test('backup WITH user data: users setting locked for teacher, glossary still empty', async ({ page }) => {
    const result = await restoreAsTeacher(page, COURSES.withUsers, 'restore-users');
    saveEvidence('verify-restore-users', result);

    expect(result.status.ok).toBe(true);
    expect(result.usersSetting.editableCheckbox).toBe(0);
    expect(result.usersSetting.permissionLock).toBe(1);
    expect(result.usersSetting.hiddenValue).toBe('0');
    expect(result.after.glossary.entries).toBe(0);
    expect.soft(result.after.qbanks[0].questiontags).toEqual(EXPECTED_QUESTION_TAGS);
  });
});
