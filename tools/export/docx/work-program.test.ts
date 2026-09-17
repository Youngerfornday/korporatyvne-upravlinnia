import { beforeAll, describe, expect, test } from 'vitest';
import type { Course } from '../../../src/content/schemas/course.ts';
import { loadCourse, numberUk, tableWithHeaders, viewDocx, type DocxView } from '../test-support/docx-xml.ts';
import { planPoints } from './assessment.ts';
import { packDocx } from './pack.ts';
import { planHours } from './structure.ts';
import { WORK_PROGRAM_SECTION_TITLES, buildWorkProgram } from './work-program.ts';

/** Робоча програма з реального course.yaml: структура розділів, повнота ПРН і тем, суми годин і балів. */

const DATE = new Date('2026-09-17T00:00:00.000Z');
const SITE_URL = 'https://youngerfornday.github.io/korporatyvne-upravlinnia/';

let course: Course;
let docx: Buffer;
let view: DocxView;

beforeAll(async () => {
  course = await loadCourse();
  docx = await packDocx(buildWorkProgram(course, { siteUrl: SITE_URL, date: DATE }), DATE);
  view = viewDocx(docx);
});

function allText(): string {
  return [...view.paragraphs.map((p) => p.text), ...view.tables.flat(2)].join('\n');
}

describe('структура робочої програми', () => {
  test('титульна сторінка й розділи йдуть у порядку РПНД з наскрізною нумерацією', () => {
    const texts = view.paragraphs.map((p) => p.text);
    expect(texts).toContain('Робоча програма навчальної дисципліни');
    expect(texts).toContain('«Корпоративне управління»');
    const headings = view.paragraphs.filter((p) => p.style === 'Heading1').map((p) => p.text);
    expect(headings).toEqual(WORK_PROGRAM_SECTION_TITLES.map((title, index) => `${index + 1}. ${title}`));
  });

  test('підрозділи оцінювання мають номери розділу', () => {
    const number = WORK_PROGRAM_SECTION_TITLES.indexOf('Оцінювання результатів навчання') + 1;
    const subheadings = view.paragraphs.filter((p) => p.style === 'Heading2').map((p) => p.text);
    expect(subheadings).toContain(`${number}.1. Розподіл балів`);
    expect(subheadings).toContain(`${number}.6. Шкала оцінювання`);
  });

  test('шрифт Times New Roman 14 за замовчуванням, таблиці 12, поля A4 30/15/20/20 мм', () => {
    expect(view.xml.styles).toMatch(/<w:docDefaults>.*w:ascii="Times New Roman".*<w:sz w:val="28"\/>/s);
    expect(view.xml.document).toContain('<w:pgSz w:w="11905" w:h="16837"');
    expect(view.xml.document).toMatch(/<w:pgMar w:top="1133" w:right="850" w:bottom="1133" w:left="1700"/);
    expect(view.xml.document).toContain('<w:sz w:val="24"/>');
  });

  test('усі ПРН, компетентності й теми присутні з кодами й формулюваннями', () => {
    const text = allText();
    for (const outcome of course.learningOutcomes) {
      expect(text).toContain(outcome.code);
    }
    const outcomes = tableWithHeaders(view, ['Код', 'Програмний результат навчання']);
    expect(outcomes.slice(1).map((row) => row[0])).toEqual(course.learningOutcomes.map((outcome) => outcome.code));
    for (const competence of course.competences) expect(text).toContain(competence.code);
    for (const topic of course.topics) expect(text).toContain(topic.title.slice(0, 20));
  });

  test('матриця ПРН × теми ставить «+» саме там, де тема формує результат', () => {
    const matrix = tableWithHeaders(view, ['ПРН', 'Т1', 'Т12']);
    for (const [index, outcome] of course.learningOutcomes.entries()) {
      const row = matrix[index + 1] ?? [];
      const marked = course.topics.filter((_, topicIndex) => row[topicIndex + 1] === '+').map((topic) => topic.id);
      expect(marked).toEqual(outcome.topics);
    }
  });
});

describe('години й бали', () => {
  test('таблиця обсягу: разом за модулями й курсом сходиться з course.yaml', () => {
    const hours = tableWithHeaders(view, ['Назва модуля і теми', 'Усього', 'Лекції', 'Практичні', 'СРС']);
    const total = hours.find((row) => row[0] === 'Усього годин')?.slice(1).map(numberUk);
    expect(total).toEqual([course.hours.total, course.hours.lectures, course.hours.practicals, course.hours.selfStudy]);
    const moduleTotals = hours.filter((row) => row[0]?.startsWith('Разом за модулем')).map((row) => numberUk(row[1] ?? ''));
    expect(moduleTotals.reduce((sum, value) => sum + value, 0)).toBe(course.hours.total);
    const topicRows = hours.filter((row) => row[0]?.startsWith('Тема '));
    expect(topicRows).toHaveLength(course.topics.length);
    for (const row of topicRows) {
      const [all, lectures, practicals, selfStudy] = row.slice(1).map(numberUk);
      expect(all).toBe((lectures ?? 0) + (practicals ?? 0) + (selfStudy ?? 0));
    }
  });

  test('план годин: практичні зараховуються основній темі, суми дорівнюють годинам курсу', () => {
    const plan = planHours(course);
    expect(plan.totals).toEqual({ ...course.hours, total: course.hours.total });
    expect(plan.modules.flatMap((module) => module.topics)).toHaveLength(course.topics.length);
  });

  test('лекції, практичні й СРС мають підсумкові рядки з годинами курсу', () => {
    const lectures = tableWithHeaders(view, ['Тема лекції та основні питання']);
    expect(numberUk(lectures.at(-1)?.at(-1) ?? '')).toBe(course.hours.lectures);
    for (const topic of course.topics) {
      expect(lectures.some((row) => row[1]?.includes(topic.lectureQuestions[0]?.slice(0, 30) ?? '—'))).toBe(true);
    }
    const practicals = tableWithHeaders(view, ['Тема практичної роботи', 'ПРН']);
    expect(numberUk(practicals.at(-1)?.at(-1) ?? '')).toBe(course.hours.practicals);
    const selfStudy = tableWithHeaders(view, ['Завдання самостійної роботи']);
    expect(numberUk(selfStudy.at(-1)?.at(-1) ?? '')).toBe(course.hours.selfStudy);
  });

  test('розподіл балів: поточний і підсумковий контроль дають 100', () => {
    const points = tableWithHeaders(view, ['Вид роботи', 'Максимум балів']);
    const value = (label: string): number => numberUk(points.find((row) => row[0] === label)?.at(-1) ?? '');
    expect(value('Поточний контроль')).toBe(course.grading.split.current);
    expect(value('Підсумковий контроль')).toBe(course.grading.split.final);
    expect(value('Разом')).toBe(100);
    expect(planPoints(course.grading).total).toBe(100);
  });

  test('рубрики практичних і кейс-проєкту, матриця підсумкового тесту і шкала', () => {
    const rubrics = view.tables.filter((table) => table[0]?.includes('Критерій і рівні виконання'));
    expect(rubrics).toHaveLength(course.practicals.length + 1);
    const finalMatrix = tableWithHeaders(view, ['Тема', 'Запам’ятовування', 'Аналіз']);
    expect(numberUk(finalMatrix.at(-1)?.at(-1) ?? '')).toBe(course.grading.finalTest.questions);
    const scale = tableWithHeaders(view, ['Сума балів', 'Оцінка ECTS']);
    expect(scale.slice(1).map((row) => row[1])).toEqual(course.scale.map((band) => band.ects));
  });
});

describe('примітки для погодження', () => {
  test('кожне поле з needsConfirmation позначено приміткою з поясненням', () => {
    const starts = view.xml.document.match(/<w:commentRangeStart w:id="\d+"\/>/g) ?? [];
    const references = view.xml.document.match(/<w:commentReference w:id="\d+"\/>/g) ?? [];
    const comments = [...view.xml.comments.matchAll(/<w:comment w:id="(\d+)"/g)].map((match) => Number(match[1]));
    expect(starts).toHaveLength(comments.length);
    expect(references).toHaveLength(comments.length);
    expect(comments).toEqual(comments.map((_, index) => index));
    const confirmable = [course.program.specialtyRecord, course.program.disciplineStatus, course.program.finalControl, course.program.semester, course.program.volume, course.policies.aiModel, course.policies.nonFormalEducation];
    const commentText = view.xml.comments.replace(/<[^>]+>/g, ' ').replace(/ /g, ' ');
    for (const field of confirmable.filter((item) => item.needsConfirmation)) {
      expect(commentText).toContain((field.note ?? '').slice(0, 25));
    }
    expect(commentText).toContain('Дані викладача');
    expect(view.xml.document).toContain('w:highlight w:val="yellow"');
  });

  test('дані викладача — плейсхолдер без персональних даних', () => {
    expect(allText()).toContain('Викладач курсу (дані вносить кафедра)');
    expect(view.xml.document).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
