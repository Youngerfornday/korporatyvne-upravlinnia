import { QuestionSchema } from '../../../content/schemas/questions';
import * as examples from '../../../content/schemas/__fixtures__/questions';
import type { Question, QuestionOf, QuestionType } from '../types';

/** Питання банку після zod (з підставленими значеннями за замовчуванням), як їх отримує рушій. */
export function parseQuestion<T extends QuestionType>(type: T, raw: unknown): QuestionOf<T> {
  const question: Question = QuestionSchema.parse(raw);
  if (question.type !== type) throw new Error(`Очікувався тип ${type}, отримано ${question.type}`);
  return question as QuestionOf<T>;
}

export const single = () => parseQuestion('multichoice', examples.multichoiceSingle());
export const multi = () => parseQuestion('multichoice', examples.multichoiceMulti());
export const trueFalse = () => parseQuestion('truefalse', examples.trueFalse());
export const matching = () => parseQuestion('matching', examples.matching());
export const numerical = () => parseQuestion('numerical', examples.numerical());
export const calculated = () => parseQuestion('calculated', examples.calculated());
export const ddwtos = () => parseQuestion('ddwtos', examples.ddwtos());
export const multianswer = () => parseQuestion('multianswer', examples.multianswer());

/** Одиночний вибір зі штрафом −33,33333% за хибний варіант. */
export function singleWithPenalty() {
  return parseQuestion('multichoice', {
    ...examples.multichoiceSingle(),
    id: 't04-q101',
    answers: [
      { text: 'Загальні збори акціонерів', fraction: 100, feedback: 'Так.' },
      { text: 'Наглядова рада', fraction: -33.33333, feedback: 'Ні.' },
      { text: 'Виконавчий орган', fraction: 0, feedback: 'Ні.' },
    ],
  });
}

/** Множинний вибір: три правильні по 33,33333% і штраф −50%. */
export function multiThirds() {
  return parseQuestion('multichoice', {
    ...examples.multichoiceMulti(),
    id: 't05-q102',
    answers: [
      { text: 'Аудиторський', fraction: 33.33333, feedback: 'Так.' },
      { text: 'З винагород', fraction: 33.33333, feedback: 'Так.' },
      { text: 'З призначень', fraction: 33.33333, feedback: 'Так.' },
      { text: 'Ревізійна комісія', fraction: -50, feedback: 'Ні.' },
    ],
  });
}

/** Відповідність, де дві пари мають однаковий текст відповіді (Moodle зливає такі варіанти в один). */
export function matchingSharedAnswer() {
  return parseQuestion('matching', {
    ...examples.matching(),
    id: 't02-q103',
    pairs: [
      { prompt: 'США', answer: 'Англо-американська', feedback: 'Так.' },
      { prompt: 'Велика Британія', answer: 'Англо-американська', feedback: 'Так.' },
      { prompt: 'Німеччина', answer: 'Німецька', feedback: 'Так.' },
    ],
    distractors: ['Японська'],
  });
}

/** Числове з кількома відповідями: точна 100%, ширший допуск 50%, «пастка» з від’ємною оцінкою. */
export function numericalGraded() {
  return parseQuestion('numerical', {
    ...examples.numerical(),
    id: 't07-q104',
    answers: [
      { value: 32.5, tolerance: 0, fraction: 100, feedback: 'Точно.' },
      { value: 32.5, tolerance: 1, fraction: 50, feedback: 'Близько.' },
      { value: 325, tolerance: 0, fraction: -50, feedback: 'Пропущено кому.' },
    ],
  });
}

/** Перетягування з двома групами і нескінченним варіантом. */
export function ddwtosGroups() {
  return parseQuestion('ddwtos', {
    ...examples.ddwtos(),
    id: 't04-q105',
    stem: 'Кворум — [[1]] акцій; зміни статуту — [[2]]; обрання голови — [[3]]; звіт ради — [[3]].',
    choices: [
      { text: 'понад 50%', group: 1, feedback: 'Кворум.' },
      { text: 'понад 3/4', group: 2, feedback: 'Кваліфікована більшість.' },
      { text: 'проста більшість', group: 2, infinite: true, feedback: 'Загальне правило.' },
      { text: '60%', group: 1, feedback: 'Стара норма.' },
    ],
  });
}

/** Cloze із трьома типами підпитань і вагами 2 / 1 / 1. */
export function clozeWeighted() {
  return parseQuestion('multianswer', {
    ...examples.multianswer(),
    id: 't04-q106',
    stem: 'Орган: {#1}. Абревіатура регулятора: {#2}. Пакет для 1 з 5 місць при 600 акціях: {#3}.',
    subquestions: [
      {
        kind: 'multichoice',
        weight: 2,
        shuffle: true,
        answers: [
          { text: 'наглядова рада', fraction: 100, feedback: 'Так.' },
          { text: 'аудитор', fraction: -50, feedback: 'Ні.' },
          { text: 'правління', fraction: 0, feedback: 'Ні.' },
        ],
      },
      {
        kind: 'shortanswer',
        answers: [
          { text: 'НКЦПФР', fraction: 100, feedback: 'Так.' },
          { text: 'ДКЦПФР', fraction: 50, feedback: 'Стара назва.' },
          { text: '*', fraction: 0, feedback: 'Ні.' },
        ],
      },
      { kind: 'numerical', answers: [{ value: 101, tolerance: 0, fraction: 100, feedback: 'Так.' }] },
    ],
  });
}
