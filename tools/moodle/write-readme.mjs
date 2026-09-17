#!/usr/bin/env node
/**
 * README-import.md поруч із .mbz: покрокове відновлення для викладача eln, імпорт глосарію
 * і чесний перелік того, чого в пакеті ще немає. Цифри беруться з плану й звіту збирання,
 * тому інструкція не розходиться з вмістом пакета.
 *
 * Запуск: node tools/moodle/write-readme.mjs --plan <plan.json> --report <build-course.json>
 *                                            --package <ім'я.mbz> --out <README-import.md>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const DATE_FORMAT = new Intl.DateTimeFormat('uk-UA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Kyiv' });

function countByType(report, type) {
  return (report?.modules ?? []).filter((module) => module.modname === type).length;
}

/** Назва тесту з плану за посиланням ref: у звіті збирання лишаються лише цифри. */
function quizNames(plan) {
  return Object.fromEntries(
    plan.sections.flatMap((section) => section.activities).filter((item) => item.type === 'quiz').map((item) => [item.ref, item.name]),
  );
}

function quizLines(plan, report) {
  const names = quizNames(plan);
  return Object.entries(report?.activities ?? {})
    .filter(([ref]) => ref.startsWith('quiz:'))
    .map(([ref, quiz]) => {
      const close = quiz.timeclose === 0 ? 'дату закриття не задано' : `закривається ${DATE_FORMAT.format(new Date(quiz.timeclose * 1000))}`;
      return `- ${names[ref] ?? ref}: питань ${quiz.slots}, максимум ${quiz.grade} балів, ${close}`;
    });
}

/** Скільки тестів мають усі заплановані питання: частково наповнений тест студентам видавати не можна. */
function filledQuizzes(plan, report) {
  const planned = Object.fromEntries(
    plan.sections
      .flatMap((section) => section.activities)
      .filter((item) => item.type === 'quiz')
      .map((item) => [item.ref, item.slots.reduce((total, slot) => total + slot.count, 0)]),
  );
  const quizzes = Object.entries(report?.activities ?? {}).filter(([ref]) => ref.startsWith('quiz:'));
  return { total: quizzes.length, filled: quizzes.filter(([ref, quiz]) => quiz.slots > 0 && quiz.slots >= (planned[ref] ?? 0)).length };
}

function bankLine(plan, report) {
  const kind = plan.bank?.quizKind === 'control' ? 'контрольного' : 'ТРЕНУВАЛЬНОГО (відповіді відкриті на сайті!)';
  return `Банк питань: ${report?.bank?.total ?? 0} питань, тести наповнено з ${kind} банку.`;
}

/**
 * Обмеження пакета — коротким людським переліком, а не дампом попереджень збирання:
 * повний перелік лишається у tools/moodle/out/build-course.json.
 */
function limitations(plan, report) {
  const stats = plan.stats ?? {};
  const quizzes = filledQuizzes(plan, report);
  const warnings = [...(plan.warnings ?? []), ...(report?.warnings ?? [])];
  const lines = [];
  if ((stats.topicsWithBook ?? 0) < (stats.topics ?? 0)) {
    lines.push(
      `- Тем з лекціями: ${stats.topicsWithBook} з ${stats.topics}. Теми без написаної лекції в пакет не потрапили — ` +
        'їхні Книги, Сторінки й посилання з’являться в наступному пакеті.',
    );
  }
  if (quizzes.filled < quizzes.total) {
    lines.push(
      `- Повністю наповнених тестів: ${quizzes.filled} з ${quizzes.total}. Решта створені з правильними налаштуваннями, ` +
        'але мають менше питань, ніж заплановано (див. «Тести» вище), поки не написані банки: не відкривайте їх студентам ' +
        'до наступного пакета.',
    );
  }
  if (plan.bank?.quizKind !== 'control') {
    lines.push('- **Тести наповнено з тренувального банку**, відповіді до якого відкриті на сайті: для оцінювання потрібен контрольний банк.');
  }
  lines.push('- Строків здачі завдань і справжніх дат тестів у пакеті немає: їх виставляє викладач за розкладом.');
  lines.push(`- Повний перелік попереджень збирання (${warnings.length}) — у tools/moodle/out/build-course.json.`);
  return lines;
}

function render({ plan, report, packageName }) {
  const glossaryEntries = plan.glossaryImport?.entries ?? 0;
  const sections = (report?.sections ?? []).map((section) => `${section.section}. ${section.name}`);
  return `# Як завантажити курс у Moodle (eln.stu.cn.ua)

Пакет: \`${packageName}\` — резервна копія курсу «${plan.course.fullname}» для Moodle 5.2.2, **без даних користувачів**.
Дата збирання: ${DATE_FORMAT.format(new Date(plan.generatedAt))} · Сайт курсу: ${plan.site}

## Що всередині

${sections.map((section) => `- Розділ ${section}`).join('\n')}

Елементів курсу: ${(report?.modules ?? []).length} (Книг ${countByType(report, 'book')}, Сторінок ${countByType(report, 'page')},
посилань ${countByType(report, 'url')}, завдань ${countByType(report, 'assign')}, тестів ${countByType(report, 'quiz')}, SCORM-тренажерів ${countByType(report, 'scorm')}, глосарій ${countByType(report, 'glossary')}).
${bankLine(plan, report)}
Журнал оцінок: ${Object.entries(report?.gradebook?.categories ?? {}).map(([name, category]) => `${name} — ${category.weight}`).join('; ')}; підсумок 0–100.

Тести:
${quizLines(plan, report).join('\n')}

## Крок 1. Відновлення курсу

Потрібна роль «Викладач» з правом редагування в курсі (слухач відновлювати не може).

1. Попросіть адміністратора створити **порожній** курс і зарахувати вас викладачем.
   Не створюйте в ньому категорій журналу оцінок і діяльностей.
2. Відкрийте курс → **Більше** → **Повторне використання курсу** → оберіть **Відновити**.
3. «Файл резервного копіювання»: **Виберіть файл...** → **Завантажити файл** → \`${packageName}\` →
   **Завантажити цей файл** → **Відновлення**.
4. Крок «1. Підтвердити»: перевірте, що це курс «${plan.course.fullname}» → **Продовжити**.
5. Крок «2. Призначення», блок «Відновити в цей курс»: **Злити резервну копію з цим курсом** → **Продовжити**.
6. Крок «3. Налаштування»: нічого не змінюйте → **Далі**.
   Червоний хрестик із замком біля «Включити зареєстрованих користувачів» — це нормально.
7. Крок «4. Схема»: **не знімайте жодної позначки**, інакше не відновиться журнал оцінок → **Далі**.
8. Крок «5. Огляд» → **Виконати відновлення**. Відновлення йде у фоні: зачекайте кілька хвилин і відкрийте курс.

## Крок 2. Імпорт термінів глосарію (обов'язково)

Записи глосарію Moodle вважає даними користувачів і резервною копією не переносить, тому одразу після
відновлення глосарій порожній — це не помилка.

1. Відкрийте «${'Глосарій курсу'}» → меню дій → **Імпорт записів**.
2. «Файл для імпорту»: **Виберіть файл...** → **Завантажити файл** → \`glossary.xml\` (лежить поруч із цим файлом) →
   **Завантажити цей файл**.
3. «Призначення імпортованих записів»: **Поточний глосарій**; позначте **Імпортувати категорії** → **Відправити**.
4. На сторінці результату «Всього записів» має дорівнювати ${glossaryEntries}.

## Крок 3. Що налаштувати після відновлення

- **Дати.** Дати закриття тестів пораховано від умовного початку семестру (${plan.startDate}) за календарним
  планом курсу. Виставте справжні дати: без дати закриття правильні відповіді студентам не відкриються ніколи.
  Строків здачі завдань навмисно не задано.
- **Мова.** У режимі злиття налаштування курсу з копії не переносяться: у налаштуваннях курсу задайте
  «Примусова мова» → Українська, інакше студент з англійським інтерфейсом уведе «1,5» як 15.
- **Перевірте:** розділи й назви; Книги відкриваються і схеми видно; **Журнал оцінок → Налаштування журналу
  оцінок** показує значимості категорій; у тестах задані дати закриття.

## Обмеження цього пакета

${limitations(plan, report).join('\n')}

Запасні шляхи, якщо відновлення недоступне (немає прав або завеликий файл): імпорт питань Moodle XML у банк
курсу, ZIP глав у модуль «Книга», глосарій окремим файлом.
`;
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { plan: { type: 'string' }, report: { type: 'string' }, package: { type: 'string' }, out: { type: 'string' } },
  strict: true,
  allowPositionals: false,
});
for (const name of ['plan', 'package', 'out']) {
  if (values[name] === undefined) {
    process.stderr.write(`Потрібен параметр --${name}\n`);
    process.exit(2);
  }
}

const plan = JSON.parse(await readFile(values.plan, 'utf8'));
const report = values.report === undefined ? null : await readFile(values.report, 'utf8').then(JSON.parse).catch(() => null);
await writeFile(values.out, render({ plan, report, packageName: values.package }), 'utf8');
process.stdout.write(`Інструкція для викладача: ${values.out}\n`);
