import type { Question } from '../../src/content/schemas/questions.ts';
import { escapeHtml, formatNumber, htmlText, questionName, typo } from './text.ts';
import { cdataElement, element, textElement, type XmlElement } from './xml.ts';

/** Спільні частини `<question>` у порядку, який довів імпорт фікстури спайку (tools/moodle/fixtures/questions.xml). */

export type QuestionOf<T extends Question['type']> = Extract<Question, { type: T }>;

/** Штраф за повторну спробу: у тестах із відкладеним відгуком не діє; так/ні — 1, як у Moodle і спайку. */
export const PENALTY_NONE = '0';
export const PENALTY_FULL = '1';

const COMBINED_FEEDBACK = {
  correctfeedback: 'Правильно.',
  partiallycorrectfeedback: 'Частково правильно.',
  incorrectfeedback: 'Неправильно.',
} as const;

export function htmlField(tag: string, html: string): XmlElement {
  return element(tag, [cdataElement('text', html)], { format: 'html' });
}

/** Дата перевірки норми в українському записі: 2026-09-15 → 15.09.2026. */
function formatCheckedAt(date: string): string {
  const [year, month, day] = date.split('-');
  return day && month && year ? `${day}.${month}.${year}` : date;
}

/**
 * Норми з `lawRef` дописуються окремими рядками до загального відгуку: тегами їх не виводимо
 * (ліміт довжини тегів Moodle), а студентові після спроби й викладачеві на рев’ю посилання потрібне.
 */
export function lawRefsHtml(lawRef: Question['lawRef']): string {
  return lawRef
    .map((reference) => {
      const text = escapeHtml(typo(`${reference.article} ${reference.act}`));
      const source = reference.url ? `<a href="${escapeHtml(reference.url)}">${text}</a>` : text;
      return `<p>Норма: ${source} (перевірено ${formatCheckedAt(reference.checkedAt)})</p>`;
    })
    .join('');
}

export interface HeaderOptions {
  readonly questionText: string;
  readonly generalFeedback: string;
  readonly penalty: string;
  /** Cloze рахує бал із ваг підпитань, тож `<defaultgrade>` не виводиться. */
  readonly withDefaultGrade?: boolean;
}

export function questionHeader(question: Question, options: HeaderOptions): XmlElement[] {
  return [
    element('name', [cdataElement('text', questionName(question.stem))]),
    htmlField('questiontext', options.questionText),
    htmlField('generalfeedback', `${options.generalFeedback}${lawRefsHtml(question.lawRef)}`),
    ...(options.withDefaultGrade === false ? [] : [textElement('defaultgrade', formatNumber(question.defaultMark))]),
    textElement('penalty', options.penalty),
    textElement('hidden', '0'),
    textElement('idnumber', question.id),
  ];
}

/** Загальні відгуки Moodle; у схемі їх немає, тож — стандартні фрази або порожні (calculated, як у спайку). */
export function combinedFeedback(mode: 'standard' | 'empty'): XmlElement[] {
  return Object.entries(COMBINED_FEEDBACK).map(([tag, phrase]) =>
    htmlField(tag, mode === 'standard' ? `<p>${escapeHtml(phrase)}</p>` : ''),
  );
}

export function feedbackField(text: string): XmlElement {
  return htmlField('feedback', htmlText(text));
}

export function tagsField(tags: readonly string[]): XmlElement {
  return element('tags', tags.map((tag) => element('tag', [textElement('text', tag)])));
}

export interface Explanation {
  readonly label: string;
  readonly feedback: string;
}

/**
 * Відгуки, яким у типі Moodle немає поля (пари відповідності, варіанти перетягування), дописуються
 * до загального відгуку списком — інакше пояснення з банку загубилися б.
 */
export function generalFeedbackWith(generalFeedback: string, explanations: readonly Explanation[]): string {
  const base = htmlText(generalFeedback);
  if (explanations.length === 0) return base;
  const items = explanations.map(
    (item) => `<li>${escapeHtml(typo(item.label))}\u00A0— ${escapeHtml(typo(item.feedback))}</li>`,
  );
  return `${base}<ul>${items.join('')}</ul>`;
}
