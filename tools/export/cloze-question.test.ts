import { describe, expect, it } from 'vitest';
import { NBSP } from '../../src/lib/typography/normalize.ts';
import { clozeMaxMark, clozeQuestionText, encodeClozeText } from './cloze-question.ts';
import { examples, parsedQuestion, question } from './test-support/banks.ts';
import { htmlEntityDecode, parseCloze } from './test-support/cloze-parse.ts';
import { textAt } from './test-support/xml-tree.ts';

type Multianswer = Extract<ReturnType<typeof question>, { type: 'multianswer' }>;

function cloze(raw: unknown): Multianswer {
  const parsed = question(raw);
  if (parsed.type !== 'multianswer') throw new Error('Очікувалося питання Cloze');
  return parsed;
}

const SPECIAL = 'a ~ b # c } d { e % f = g \\ h & i < j " k';
/** Той самий текст після типографіки: пряма лапка стає відкривною «. */
const SPECIAL_SHOWN = SPECIAL.replace('"', '«');

describe('Cloze: код підпитань читається парсером Moodle', () => {
  it('ваги, типи, оцінки, допуски й відгуки повертаються без змін', () => {
    const raw = {
      ...examples.multianswer(),
      stem: 'Обрання {#1}, пакет {#2}, орган {#3}.',
      subquestions: [
        {
          kind: 'multichoice',
          display: 'vertical',
          shuffle: true,
          weight: 2,
          answers: [
            { text: 'членів ради', fraction: 100, feedback: 'Так.' },
            { text: 'аудитора', fraction: 50, feedback: 'Частково.' },
            { text: 'нікого', fraction: -33.33333, feedback: 'Ні.' },
          ],
        },
        {
          kind: 'numerical',
          answers: [
            { value: 101, tolerance: 0, fraction: 100, feedback: 'Точно.' },
            { value: 100.5, tolerance: 0.25, fraction: 50, feedback: 'Близько.' },
          ],
        },
        { kind: 'shortanswer', caseSensitive: true, answers: [{ text: 'НКЦПФР', fraction: 100, feedback: 'Так.' }] },
      ],
    };
    const html = textAt(parsedQuestion(raw), 'questiontext', 'text');
    const parsed = parseCloze(html);
    expect(parsed.text).toBe('<p>Обрання {#1}, пакет {#2}, орган {#3}.</p>');
    expect(parsed.subquestions).toEqual([
      {
        weight: 2,
        type: 'MULTICHOICE_VS',
        alternatives: [
          { fraction: 1, answer: 'членів ради', feedback: 'Так.' },
          { fraction: 0.5, answer: 'аудитора', feedback: 'Частково.' },
          { fraction: -0.3333333, answer: 'нікого', feedback: 'Ні.' },
        ],
      },
      {
        weight: 1,
        type: 'NUMERICAL',
        alternatives: [
          { fraction: 1, answer: '101', feedback: 'Точно.', tolerance: 0 },
          { fraction: 0.5, answer: '100.5', feedback: 'Близько.', tolerance: 0.25 },
        ],
      },
      { weight: 1, type: 'SHORTANSWER_C', alternatives: [{ fraction: 1, answer: 'НКЦПФР', feedback: 'Так.' }] },
    ]);
    expect(clozeMaxMark(cloze(raw))).toBe(4);
  });

  it.each([
    ['dropdown', false, 'MULTICHOICE'],
    ['dropdown', true, 'MULTICHOICE_S'],
    ['vertical', false, 'MULTICHOICE_V'],
    ['vertical', true, 'MULTICHOICE_VS'],
    ['horizontal', false, 'MULTICHOICE_H'],
    ['horizontal', true, 'MULTICHOICE_HS'],
  ])('вигляд %s, перемішування %s → %s', (display, shuffle, code) => {
    const raw = examples.multianswer();
    const [first, second] = raw.subquestions;
    const text = clozeQuestionText(cloze({ ...raw, subquestions: [{ ...first, display, shuffle }, second] }));
    expect(parseCloze(text).subquestions[0]?.type).toBe(code);
  });

  it('спецсимволи Cloze і HTML у варіантах та відгуках не ламають розбір і повертаються буквально', () => {
    const raw = {
      ...examples.multianswer(),
      stem: 'Текст із {дужками} і {#1} та {#2}.',
      subquestions: [
        {
          kind: 'multichoice',
          answers: [
            { text: SPECIAL, fraction: 100, feedback: SPECIAL },
            { text: '=на початку', fraction: 0, feedback: '%50% теж текст' },
          ],
        },
        { kind: 'shortanswer', answers: [{ text: 'зірка * і ~', fraction: 100, feedback: 'ок' }] },
      ],
    };
    const text = clozeQuestionText(cloze(raw));
    const parsed = parseCloze(text);
    expect(parsed.text).toBe(`<p>Текст із &#123;дужками&#125; і${NBSP}{#1} та {#2}.</p>`);
    const [choice, short] = parsed.subquestions;
    // Варіант вибору зберігається як HTML: після розкодування сутностей Moodle показує той самий текст.
    expect(choice?.alternatives.map((alternative) => htmlEntityDecode(alternative.answer))).toEqual([SPECIAL_SHOWN, '=на початку']);
    expect(choice?.alternatives.map((alternative) => htmlEntityDecode(alternative.feedback))).toEqual([SPECIAL_SHOWN, '%50% теж текст']);
    expect(choice?.alternatives.map((alternative) => alternative.fraction)).toEqual([1, 0]);
    // Коротку відповідь порівнюють буквально: зірка екранована, щоб не стати шаблоном.
    expect(short?.alternatives).toEqual([{ fraction: 1, answer: 'зірка \\* і ~', feedback: 'ок' }]);
  });

  it('коротка відповідь без нерозривних пробілів і з варіантами апострофа', () => {
    const raw = {
      ...examples.multianswer(),
      stem: 'Термін: {#1}.',
      subquestions: [{ kind: 'shortanswer', answers: [{ text: "об'єкт у власності", fraction: 100, feedback: 'Так.' }] }],
    };
    const [short] = parseCloze(clozeQuestionText(cloze(raw))).subquestions;
    expect(short?.alternatives.map((alternative) => alternative.answer)).toEqual([
      'об’єкт у власності',
      "об'єкт у власності",
      'обʼєкт у власності',
    ]);
    expect(short?.alternatives.every((alternative) => !alternative.answer.includes(NBSP))).toBe(true);
    expect(short?.alternatives.every((alternative) => alternative.fraction === 1)).toBe(true);
  });

  it('encodeClozeText кодує лише службові символи', () => {
    expect(encodeClozeText('звичайний текст 12.5')).toBe('звичайний текст 12.5');
    expect(htmlEntityDecode(encodeClozeText(SPECIAL))).toBe(SPECIAL);
    expect(encodeClozeText(SPECIAL).replace(/&(?:[a-z]+|#\d+);/g, '')).not.toMatch(/[~#{}%=\\<>"&]/);
  });

  it('XML Cloze-питання: тип cloze, без defaultgrade, штраф 0', () => {
    const node = parsedQuestion(examples.multianswer());
    expect(node.attributes.type).toBe('cloze');
    expect(node.children.some((entry) => entry.name === 'defaultgrade')).toBe(false);
    expect(textAt(node, 'penalty')).toBe('0');
  });
});
