import type { Course } from '../../src/content/schemas/course.ts';
import type { PracticalFile } from '../../src/content/schemas/practical.ts';
import { typo } from '../../src/lib/typography/index.ts';
import { escapeAttribute, escapeHtmlText } from './html-tree.ts';

/**
 * Сторінка умов практичної роботи для друку в PDF. Окремої сторінки практичної на сайті поки немає, тому
 * HTML складається з реєстру курсу (мета, результати, завдання, рубрика, дані) і файлу тренажера (вступ,
 * вихідні дані завдань, тема есе) у стилях сайту: `<head>` береться зі зібраної сторінки теми, тож шрифти,
 * токени й print CSS — ті самі, що в лекцій. Відповіді й пояснення тренажера в умови не потрапляють.
 */

type Practical = Course['practicals'][number];

const PRACTICAL_PRINT_CSS =
  '<style>@media print { .read h2 { break-before: auto; page-break-before: auto; } } .rubric td.points, .rubric th.points { text-align: center; white-space: nowrap; }</style>';

const STATUS_LABEL = { draft: 'чернетка', review: 'на перевірці', verified: 'перевірено' } as const;

function t(value: string): string {
  return escapeHtmlText(typo(value));
}

function listHtml(tag: 'ul' | 'ol', items: readonly string[]): string {
  return `<${tag}>${items.map((item) => `<li>${t(item)}</li>`).join('')}</${tag}>`;
}

function link(url: string): string {
  return `<a href="${escapeAttribute(url)}">${escapeHtmlText(url)}</a>`;
}

const numberFormat = new Intl.NumberFormat('uk-UA');

function rubricHtml(practical: Practical): string {
  const rows = practical.rubric.flatMap((criterion) => [
    `<tr><th scope="rowgroup" colspan="2">${t(criterion.title)}</th><th class="points">${numberFormat.format(criterion.points)}</th></tr>`,
    ...criterion.levels.map((level) => `<tr><td></td><td>${t(level.description)}</td><td class="points">${numberFormat.format(level.points)}</td></tr>`),
  ]);
  const total = practical.rubric.reduce((sum, criterion) => sum + criterion.points, 0);
  return (
    '<table class="rubric"><thead><tr><th scope="col"></th><th scope="col">Критерій і рівні виконання</th><th scope="col" class="points">Бали</th></tr></thead>' +
    `<tbody>${rows.join('')}<tr><th scope="row" colspan="2">Максимум</th><th class="points">${numberFormat.format(total)}</th></tr></tbody></table>`
  );
}

/** Вихідні дані завдань — свої для кожного виду тренажера; відповіді в умови не потрапляють. */
function trainerDataHtml(trainer: PracticalFile['trainer']): string {
  if (trainer.kind === 'model-matrix') {
    const companies = trainer.companyTasks.map((task) => `<li><b>${t(task.company)}.</b> ${t(task.description)}</li>`).join('');
    return `<h3>Компанії для визначення моделі</h3><ol>${companies}</ol>`;
  }
  const startups = trainer.cases.map((item) => `<li><b>${t(item.title)}.</b> ${t(item.description)}</li>`).join('');
  const rows = trainer.statistics.points
    .map((point) => `<tr><th scope="row">${t(point.date.split('-').reverse().join('.'))}</th>${trainer.statistics.forms.map((form) => `<td class="points">${numberFormat.format(point.values[form.key] ?? 0)}</td>`).join('')}</tr>`)
    .join('');
  const head = trainer.statistics.forms.map((form) => `<th scope="col" class="points">${t(form.short)}</th>`).join('');
  const risks = trainer.agreement.risks.map((risk) => `<li><b>${t(risk.risk)}</b> ${t(risk.mustSettle)}</li>`).join('');
  return (
    `<h3>${t(trainer.statistics.title)}</h3>` +
    `<table class="rubric"><thead><tr><th scope="col">Станом на</th>${head}</tr></thead><tbody>${rows}</tbody></table>` +
    `<p>${t(trainer.statistics.note)}</p>` +
    '<h3>Стартапи для вибору форми</h3>' +
    `<ol>${startups}</ol>` +
    '<h3>Ризики стартапу для корпоративного договору</h3>' +
    `<ol>${risks}</ol>`
  );
}

function trainerHtml(file: PracticalFile): string {
  const { essay } = file.trainer;
  return (
    trainerDataHtml(file.trainer) +
    '<h3>Есе</h3>' +
    `<p>${t(essay.prompt)}</p>` +
    `<p>Обсяг — до ${numberFormat.format(essay.maxWords)} слів. Що має бути в есе:</p>` +
    listHtml('ul', essay.expectations)
  );
}

function dataHtml(practical: Practical): string {
  const items = practical.data.map((item) => `<li>${t(item.title)}. ${link(item.url)}${item.note === undefined ? '' : ` <br>${t(item.note)}`}</li>`);
  return `<ul>${items.join('')}</ul>`;
}

export interface PracticalPageInput {
  readonly course: Course;
  readonly practical: Practical;
  readonly file: PracticalFile;
  /** Вміст `<head>` зібраної сторінки сайту (шрифти й стилі). */
  readonly head: string;
}

/** Заголовок документа PDF (метадані Title) — як у сторінок сайту: «Назва — Курс». */
export function practicalTitle(course: Course, practical: Practical): string {
  const number = course.practicals.findIndex((candidate) => candidate.id === practical.id) + 1;
  return `Практична робота ${number}. ${practical.title}`;
}

/** `<head>` сторінки без скриптів і з власним `<title>`. */
export function reuseHead(head: string, title: string): string {
  return head
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtmlText(title)}</title>`);
}

/** Вміст `<head>` із повної HTML-сторінки. */
export function extractHead(html: string): string {
  const match = /<head>([\s\S]*?)<\/head>/i.exec(html);
  if (!match?.[1]) throw new Error('У зібраній сторінці сайту немає <head>: не звідки взяти шрифти й стилі для PDF');
  return match[1];
}

export function renderPracticalPage(input: PracticalPageInput): string {
  const { course, practical, file } = input;
  const title = practicalTitle(course, practical);
  const module = course.modules.find((candidate) => candidate.id === practical.module);
  const moduleNumber = course.modules.findIndex((candidate) => candidate.id === practical.module) + 1;
  const topics = practical.topics.map((id) => {
    const index = course.topics.findIndex((topic) => topic.id === id);
    return `Тема ${index + 1}. ${course.topics[index]?.title ?? id}`;
  });
  const outcomes = practical.prn.map((id) => course.learningOutcomes.find((outcome) => outcome.id === id)?.code ?? id);
  const facts = [
    `Модуль ${moduleNumber}. ${module?.title ?? practical.module}`,
    `${numberFormat.format(practical.hours)} год`,
    `ПРН: ${outcomes.join(', ')}`,
    `статус: ${STATUS_LABEL[file.status]}, оновлено ${file.updatedAt.split('-').reverse().join('.')}`,
  ];
  const body =
    '<div class="container"><header class="topic-head">' +
    `<h1 class="h1">${t(title)}</h1><p class="lede">${t(practical.goal)}</p>` +
    `<div class="topic-facts">${facts.map((fact) => `<span>${t(fact)}</span>`).join('')}</div></header>` +
    '<article class="read">' +
    `<p>${t(file.intro)}</p>` +
    `<h2 class="h2-plain">Теми курсу</h2>${listHtml('ul', topics)}` +
    `<h2 class="h2-plain">Результати навчання</h2>${listHtml('ul', practical.results)}` +
    `<h2 class="h2-plain">Завдання</h2>${listHtml('ol', practical.tasks)}${trainerHtml(file)}` +
    `<h2 class="h2-plain">Рубрика оцінювання</h2>${rubricHtml(practical)}` +
    `<h2 class="h2-plain">Дані та джерела</h2>${dataHtml(practical)}` +
    '</article></div>';
  return `<!DOCTYPE html><html lang="uk"><head>${reuseHead(input.head, `${title} — ${course.title}`)}${PRACTICAL_PRINT_CSS}</head><body><main id="main">${body}</main></body></html>`;
}
