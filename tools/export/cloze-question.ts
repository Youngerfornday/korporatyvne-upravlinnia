import { PENALTY_NONE, questionHeader, type QuestionOf } from './question-parts.ts';
import { escapeHtml, formatFraction, formatNumber, htmlText, toHtmlParagraphs, typo, typoPlain } from './text.ts';
import type { XmlElement } from './xml.ts';

/**
 * Moodle multianswer (Cloze): мітки `{#n}` у стовбурі замінюються кодом `{вага:ТИП:варіант~варіант}`.
 *
 * Спецсимволи. Парсер Moodle 5.2.2 (`qtype_multianswer_extract_question`) обриває варіант на `~ # }`,
 * вважає `=` і `%n%` на початку оцінкою, а з екранувань знімає лише `\}` і `\#`. Зате текст варіанта й відгуку
 * проходить `html_entity_decode`, тож усі службові символи кодуються числовими сутностями — вони
 * гарантовано повертаються буквально. Текст для показу (варіанти вибору, відгуки) спершу екранується як HTML.
 */

const PLACEHOLDER = /\{#(\d+)\}/g;
const CLOZE_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '{': '&#123;',
  '}': '&#125;',
  '~': '&#126;',
  '#': '&#35;',
  '%': '&#37;',
  '=': '&#61;',
  '\\': '&#92;',
};
const MULTICHOICE_CODES = {
  dropdown: ['MULTICHOICE', 'MULTICHOICE_S'],
  vertical: ['MULTICHOICE_V', 'MULTICHOICE_VS'],
  horizontal: ['MULTICHOICE_H', 'MULTICHOICE_HS'],
} as const;
/** Апострофи, які студент може набрати замість типографського ’. */
const APOSTROPHE_VARIANTS = ['’', "'", 'ʼ'];

type Subquestion = QuestionOf<'multianswer'>['subquestions'][number];

export function encodeClozeText(text: string): string {
  return text.replace(/[&<>"{}~#%=\\]/g, (char) => CLOZE_ENTITIES[char] ?? char);
}

/** Текст, який Moodle покаже як HTML (варіант вибору, відгук). */
function clozeHtml(text: string): string {
  return encodeClozeText(escapeHtml(typo(text).replace(/\s*\n\s*/g, ' ')));
}

function fractionPrefix(percent: number): string {
  const fraction = formatFraction(percent);
  if (fraction === '100') return '=';
  return fraction === '0' ? '' : `%${fraction}%`;
}

/**
 * Коротка відповідь порівнюється з введенням буквально (NFC, пробіли по краях): без нерозривних пробілів,
 * зірка екранована (інакше це шаблон), і для кожного апострофа — варіанти з ’, ' та ʼ з тією самою оцінкою.
 */
function shortAnswerTexts(text: string): string[] {
  const plain = typoPlain(text).replace(/\*/g, '\\*');
  if (!/[’'ʼ]/.test(plain)) return [plain];
  return [...new Set(APOSTROPHE_VARIANTS.map((apostrophe) => plain.replace(/[’'ʼ]/g, apostrophe)))];
}

function alternatives(subquestion: Subquestion): string[] {
  switch (subquestion.kind) {
    case 'multichoice':
      return subquestion.answers.map(
        (answer) => `${fractionPrefix(answer.fraction)}${clozeHtml(answer.text)}#${clozeHtml(answer.feedback)}`,
      );
    case 'shortanswer':
      return subquestion.answers.flatMap((answer) =>
        shortAnswerTexts(answer.text).map(
          (text) => `${fractionPrefix(answer.fraction)}${encodeClozeText(text)}#${clozeHtml(answer.feedback)}`,
        ),
      );
    case 'numerical':
      return subquestion.answers.map(
        (answer) =>
          `${fractionPrefix(answer.fraction)}${formatNumber(answer.value)}:${formatNumber(answer.tolerance)}#${clozeHtml(answer.feedback)}`,
      );
  }
}

function subquestionCode(subquestion: Subquestion): string {
  const type =
    subquestion.kind === 'multichoice'
      ? MULTICHOICE_CODES[subquestion.display][subquestion.shuffle ? 1 : 0]
      : subquestion.kind === 'shortanswer'
        ? subquestion.caseSensitive
          ? 'SHORTANSWER_C'
          : 'SHORTANSWER'
        : 'NUMERICAL';
  return `{${subquestion.weight}:${type}:${alternatives(subquestion).join('~')}}`;
}

/** Рядок стовбура: текст екранується (і `{`/`}` — щоб не утворити код Cloze), мітки стають кодами. */
function renderStemLine(line: string, codes: readonly string[]): string {
  return line
    .split(PLACEHOLDER)
    .map((part, index) =>
      index % 2 === 1 ? (codes[Number(part) - 1] ?? '') : escapeHtml(part).replace(/[{}]/g, (char) => CLOZE_ENTITIES[char] ?? char),
    )
    .join('');
}

export function clozeQuestionText(question: QuestionOf<'multianswer'>): string {
  const codes = question.subquestions.map(subquestionCode);
  return toHtmlParagraphs(typo(question.stem), (line) => renderStemLine(line, codes));
}

export function clozeBody(question: QuestionOf<'multianswer'>): XmlElement[] {
  return questionHeader(question, {
    questionText: clozeQuestionText(question),
    generalFeedback: htmlText(question.generalFeedback),
    penalty: PENALTY_NONE,
    withDefaultGrade: false,
  });
}
