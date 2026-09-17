/**
 * HTML для елементів курсу Moodle: описи модулів, Сторінка «Про курс», Сторінка теми, умови практичних.
 * Текст береться з реєстру `content/course.yaml`, тому все, що тут є, — це оформлення, а не зміст.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ESCAPES[char]);
}

/** @param {readonly string[]} items */
export function list(items, ordered = false) {
  if (items.length === 0) return '';
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`;
}

/** @param {readonly string[]} headers @param {ReadonlyArray<readonly string[]>} rows */
export function table(headers, rows) {
  const head = `<thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>`;
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
  return `<table class="generaltable">${head}<tbody>${body}</tbody></table>`;
}

export function paragraph(textValue) {
  return `<p>${escapeHtml(textValue)}</p>`;
}

export function heading(textValue) {
  return `<h4>${escapeHtml(textValue)}</h4>`;
}

/** Номер теми для показу: `t01` → `1`. */
export function topicNumber(topicId) {
  return String(Number(topicId.slice(1)));
}

export function moduleNumber(moduleId) {
  return String(Number(moduleId.slice(1)));
}

/** Код ПРН для показу: `prn03` → `ПРН3`. */
export function outcomeCode(prnId) {
  return `ПРН${Number(prnId.replace(/\D/g, ''))}`;
}

export function siteLink(site, path, label) {
  const url = new URL(path, site).toString();
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

/** Сторінка теми: результати навчання і завдання для самостійної роботи. */
export function topicPageHtml(topic, site) {
  const results = topic.results.map(
    (result) => `${result.prn.map((prn) => `<strong>${escapeHtml(outcomeCode(prn))}</strong>`).join(' ')} — ${escapeHtml(result.statement)}`,
  );
  const tasks = topic.selfStudyTasks.map(
    (task) => `${escapeHtml(task.task)} <em>(${escapeHtml(task.hours)} год)</em>`,
  );
  const hours = topic.hours ?? {};
  return [
    heading('Що ви зможете після теми'),
    list(results),
    heading('Питання лекції'),
    list(topic.lectureQuestions.map(escapeHtml), true),
    heading('Завдання для самостійної роботи'),
    list(tasks),
    paragraph(`Аудиторних годин: ${hours.lectures ?? 0}; самостійної роботи: ${hours.selfStudy ?? 0}.`),
    `<p>${siteLink(site, `temy/${topic.slug}/`, 'Матеріали теми на сайті курсу')} · ${siteLink(site, `testy/${topic.slug}/`, 'Тренувальний тест теми')}</p>`,
  ].join('\n');
}

/** Опис Книги теми: анотація теми й нагадування, де лежить інтерактив. */
export function bookIntroHtml(topic, site) {
  return [
    paragraph(topic.summary),
    `<p>Інтерактивні схеми, підказки термінів і самоперевірка — на сайті курсу: ${siteLink(site, `temy/${topic.slug}/`, 'відкрити тему')}.</p>`,
  ].join('\n');
}

/** Умова практичної роботи: мета, результати, завдання й нагадування про рубрику. */
export function practicalIntroHtml(practical, site, points) {
  const trainers = practical.trainers ?? [];
  return [
    paragraph(practical.goal),
    heading('Ви навчитеся'),
    list(practical.results.map(escapeHtml)),
    heading('Завдання'),
    list(practical.tasks.map(escapeHtml), true),
    paragraph(`Максимум ${points} бали. Роботу оцінюють за рубрикою — критерії відкриті нижче.`),
    trainers.length === 0
      ? ''
      : `<p>Тренажери до роботи — на сайті курсу: ${siteLink(site, 'praktykumy/', 'практикуми')}.</p>`,
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/** Умова кейс-проєкту: мета, критерії вибору компанії, етапи. */
export function caseProjectIntroHtml(caseProject, points) {
  const stages = caseProject.stages.map((stage) => `<strong>${escapeHtml(stage.title)}.</strong> ${escapeHtml(stage.deliverable)}`);
  return [
    paragraph(caseProject.goal),
    heading('Вимоги до компанії'),
    list(caseProject.companyCriteria.map(escapeHtml)),
    heading('Етапи'),
    list(stages),
    paragraph(`Максимум ${points} балів. Роботу оцінюють за рубрикою — критерії відкриті нижче.`),
  ].join('\n');
}

/** Опис тесту: скільки питань, скільки часу, коли відкриються правильні відповіді. */
export function quizIntroHtml({ questions, minutes, attempts, points, scope, closeNote }) {
  return [
    paragraph(`${scope} ${questions} питань, ${minutes} хв, спроб: ${attempts}. Максимум ${points} балів.`),
    paragraph('Питання добираються випадково з банку курсу, тому набір у кожного свій.'),
    paragraph('Бали видно одразу після спроби; правильні відповіді й пояснення відкриваються після закриття тесту.'),
    closeNote === undefined ? '' : paragraph(closeNote),
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/** Опис глосарія з інструкцією викладачеві: записи не переносяться резервною копією. */
export function glossaryIntroHtml(termCount) {
  return [
    paragraph('Терміни курсу з означеннями. Глосарій увімкнено для автозв’язування: терміни підсвічуються в текстах курсу.'),
    `<p><strong>Викладачеві:</strong> записи глосарію Moodle вважає даними користувачів і не переносить резервною копією. ` +
      `Одразу після відновлення глосарій порожній — імпортуйте файл <code>glossary.xml</code> з пакета (${escapeHtml(termCount)} записів): ` +
      `меню глосарію → «Імпорт записів» → «Поточний глосарій» → позначити «Імпортувати категорії».</p>`,
  ].join('\n');
}

/** Сторінка «Про курс»: анотація, обсяг, оцінювання, шкала, політики. */
export function aboutPageHtml(course, site) {
  const { grading, hours, scale, policies, credits } = course;
  const gradeRows = grading.categories.map((category) => [
    escapeHtml(category.title),
    escapeHtml(category.items === 1 ? category.pointsPerItem : `${category.items} × ${category.pointsPerItem}`),
    escapeHtml(category.items * category.pointsPerItem),
  ]);
  const scaleRows = scale.map((step) => [
    `${escapeHtml(step.min)}–${escapeHtml(step.max)}`,
    escapeHtml(step.ects),
    escapeHtml(step.national),
  ]);
  return [
    paragraph(course.annotation),
    heading('Мета'),
    paragraph(course.goal),
    heading('Обсяг'),
    paragraph(
      `${credits} кредити ЄКТС, ${hours.total} год: лекції ${hours.lectures}, практичні ${hours.practicals}, самостійна робота ${hours.selfStudy}.`,
    ),
    heading('Оцінювання'),
    table(['Складова', 'Розрахунок', 'Балів'], [...gradeRows, ['<strong>Разом</strong>', '', '<strong>100</strong>']]),
    paragraph(grading.admission.currentScoreOption),
    heading('Шкала'),
    table(['Бали', 'ЄКТС', 'Національна'], scaleRows),
    heading('Політики курсу'),
    list(
      [
        ['Відвідування', policies.attendance],
        ['Строки', policies.deadlines],
        ['Академічна доброчесність', policies.academicIntegrity],
        ['Штучний інтелект', policies.ai],
        ['Додаткові бали', policies.bonusPoints],
        ['Перескладання', policies.retakes],
      ]
        .filter(([, value]) => typeof value === 'string' && value !== '')
        .map(([label, value]) => `<strong>${escapeHtml(label)}.</strong> ${escapeHtml(value)}`),
    ),
    `<p>${siteLink(site, '', 'Сайт курсу з інтерактивними матеріалами')}</p>`,
  ].join('\n');
}
