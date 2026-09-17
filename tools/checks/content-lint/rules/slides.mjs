/**
 * Правило 9. Презентації тем (`content/modules/mN/tNN/slides.yaml`).
 * Слайди — стислий переказ лонгріда, тож правило стежить, щоб вони не принесли нічого нового:
 *  — слайд із відсотком чи сумою (у тексті або нотатках) має `sources` або `lawRef` — помилка;
 *  — таке число є і в лонгріді теми — інакше попередження (можливо, новий факт);
 *  — норма має код рядка legal-baseline у `lawRef.article` — помилка;
 *  — кейс є в реєстрі course.yaml і в списку кейсів цієї теми — помилка;
 *  — схема — файл, який імпортує лонгрід теми, — помилка.
 * Існування кодів і дати перевірки норм, номери законів і висячі ID джерел перевіряють загальні правила.
 */
import { isSlidesFile } from '../content.mjs';
import { ERROR, WARNING, makeFinding } from '../finding.mjs';
import { codesIn } from '../refs.mjs';
import { quote, splitSentences } from '../text.mjs';
import { hasNumericFact } from './numbers.mjs';

export const RULE_NUMBER_SOURCE = 'slide-number-source';
export const RULE_NUMBER_LECTURE = 'slide-number-lecture';
export const RULE_NORM_CODE = 'slide-norm-code';
export const RULE_CASE = 'slide-case';
export const RULE_FIGURE = 'slide-figure';

const SOURCE_HINT = 'Додайте до слайда `sources: [id]` з sources.yaml теми (або `lawRef` для норми): кожне число презентації має джерело.';
const LECTURE_HINT = 'Презентація переказує лонгрід: звірте число з lecture.mdx теми. Якщо факт новий — спершу додайте його в лонгрід із джерелом.';
const NORM_HINT = 'Допишіть у `lawRef.article` код рядка з docs/research/legal-baseline.md, наприклад «ст. 6 ч. 1–4 (AT-01)».';
const CASE_HINT = 'Кейс береться з реєстру cases у course.yaml і має бути в списку `cases` цієї теми.';
const FIGURE_HINT = 'На слайді — лише схеми лонгріда: файл fig-*.svg з каталогу теми, який імпортує lecture.mdx.';

/** Поля, які не є текстом слайда: ідентифікатори, посилання, файли. */
const NOT_TEXT_KEYS = new Set(['id', 'type', 'figure', 'case', 'topic']);
const NOT_TEXT_PATHS = new Set(['sources', 'lawRef']);

const NUMBER = '\\d+(?:[\\s\\u00a0]\\d{3})*(?:[.,]\\d+)?';
const NUMBER_WITH_UNIT = new RegExp(`(?<![\\d.,])(${NUMBER})\\s?(?:%|млн|млрд|тис|грн|дол|євро)`, 'giu');
const ANY_NUMBER = new RegExp(NUMBER, 'gu');
const PLAIN_NUMBER = /\d+(?:[.,]\d+)?/g;

const compact = (number) => number.replace(/[\s ]/g, '');

/** Числа з відсотком або грошовою одиницею: «151,2 млрд грн» → «151,2». */
export function numbersWithUnits(text) {
  return [...text.matchAll(NUMBER_WITH_UNIT)].map(([, number]) => compact(number));
}

/** Усі числа лонгріда: і з розрядами через пробіл («1 200» → «1200»), і кожна група окремо. */
export function lectureNumbers(text) {
  return new Set([
    ...[...text.matchAll(ANY_NUMBER)].map(([number]) => compact(number)),
    ...[...text.matchAll(PLAIN_NUMBER)].map(([number]) => number),
  ]);
}

function topicFolder(file) {
  return file.file.slice(0, file.file.lastIndexOf('/') + 1);
}

/** Мапа кожного слайда в моделі файлу: рядки початку й кінця. */
function slideNodes(file) {
  return file.maps.filter((node) => node.path.length === 1 && node.path[0] === 'slides' && typeof node.keys.id === 'string');
}

function fieldLine(file, node, field) {
  for (let line = node.line; line <= node.endLine; line += 1) {
    if (new RegExp(`^\\s*(?:-\\s+)?${field}:`).test(file.lines[line - 1] ?? '')) return line;
  }
  return node.line;
}

function textUnits(file, node) {
  return file.units.filter((unit) => unit.line >= node.line && unit.endLine <= node.endLine)
    .filter((unit) => !(unit.key !== null && NOT_TEXT_KEYS.has(unit.key)))
    .filter((unit) => !unit.path.some((step) => NOT_TEXT_PATHS.has(step)));
}

function numberIssues(file, node, slide, lecture) {
  const units = textUnits(file, node);
  const numeric = units.flatMap((unit) => splitSentences(unit.text).filter(hasNumericFact).map((sentence) => ({ unit, sentence })));
  const hasSource = (Array.isArray(slide.sources) && slide.sources.length > 0) || slide.lawRef !== undefined;
  const missingSource = numeric.length > 0 && !hasSource
    ? [makeFinding({
        file: file.file, line: numeric[0].unit.line, rule: RULE_NUMBER_SOURCE, level: ERROR,
        message: `Слайд «${slide.id}»: число без джерела — додайте sources або lawRef`,
        hint: SOURCE_HINT,
        quote: quote(numeric[0].sentence),
      })]
    : [];
  if (lecture === undefined) return missingSource;
  const known = lectureNumbers(lecture.text);
  const unknown = units.flatMap((unit) => numbersWithUnits(unit.text).filter((number) => !known.has(number)).map((number) => ({ unit, number })));
  const notInLecture = unknown.map(({ unit, number }) => makeFinding({
    file: file.file, line: unit.line, rule: RULE_NUMBER_LECTURE, level: WARNING,
    message: `Слайд «${slide.id}»: числа ${number} немає в лонгріді теми`,
    hint: LECTURE_HINT,
    quote: quote(unit.text),
  }));
  return [...missingSource, ...notInLecture];
}

function normIssues(file, node, slide) {
  if (slide.type !== 'norm' || codesIn(String(slide.lawRef?.article ?? '')).length > 0) return [];
  return [makeFinding({
    file: file.file, line: fieldLine(file, node, 'article'), rule: RULE_NORM_CODE, level: ERROR,
    message: `Слайд «${slide.id}»: норма без коду рядка legal-baseline у lawRef`,
    hint: NORM_HINT,
    quote: quote(String(slide.lawRef?.article ?? '')),
  })];
}

function caseIssues(file, node, slide, topic, course) {
  if (slide.type !== 'case') return [];
  const registered = (course?.cases ?? []).some((entry) => entry.id === slide.case);
  const topicCases = (course?.topics ?? []).find((entry) => entry.id === topic)?.cases ?? [];
  const inTopic = topicCases.some((entry) => entry.case === slide.case);
  if (registered && inTopic) return [];
  const message = registered
    ? `Слайд «${slide.id}»: кейсу «${slide.case}» немає в списку кейсів теми ${topic} у course.yaml`
    : `Слайд «${slide.id}»: кейс «${slide.case}» не зареєстровано в course.yaml`;
  return [makeFinding({ file: file.file, line: fieldLine(file, node, 'case'), rule: RULE_CASE, level: ERROR, message, hint: CASE_HINT })];
}

function figureIssues(file, node, slide, lecture) {
  if (slide.type !== 'figure' || lecture === undefined || lecture.text.includes(`./${slide.figure}`)) return [];
  return [makeFinding({
    file: file.file, line: fieldLine(file, node, 'figure'), rule: RULE_FIGURE, level: ERROR,
    message: `Слайд «${slide.id}»: схему ${slide.figure} лонгрід теми не імпортує`,
    hint: FIGURE_HINT,
  })];
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {{ cases?: Array<{ id: string }>, topics?: Array<{ id: string, cases?: Array<{ case: string }> }> }} course
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkSlides(files, course) {
  return files.filter(isSlidesFile).flatMap((file) => {
    const lecture = files.find((candidate) => candidate.file === `${topicFolder(file)}lecture.mdx`);
    const slides = Array.isArray(file.data?.slides) ? file.data.slides : [];
    const topic = String(file.data?.topic ?? '');
    return slideNodes(file).flatMap((node) => {
      const slide = slides.find((item) => item?.id === node.keys.id);
      if (slide === undefined) return [];
      return [
        ...numberIssues(file, node, slide, lecture),
        ...normIssues(file, node, slide),
        ...caseIssues(file, node, slide, topic, course),
        ...figureIssues(file, node, slide, lecture),
      ];
    });
  });
}
