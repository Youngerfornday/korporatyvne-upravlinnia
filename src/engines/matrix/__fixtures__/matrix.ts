/**
 * Маленька матриця для тестів рушія: три моделі × три ознаки. Форма даних збігається з
 * `content/practicals/pNN.yaml` → trainer (схема src/content/schemas/practical.ts).
 */
import type { CompanyTaskDefinition, MatrixDefinition } from '../types';

export const MODELS = [
  { id: 'outsider', title: 'Аутсайдерська модель', short: 'Аутсайдерська' },
  { id: 'insider', title: 'Інсайдерська модель', short: 'Інсайдерська' },
  { id: 'family', title: 'Сімейна модель', short: 'Сімейна' },
] as const;

function cell(model: string, statement: string, source = 'src-a', alsoSources: readonly string[] = []) {
  return { model, statement, explanation: `Пояснення: ${statement}`, source, alsoSources };
}

export const MATRIX: MatrixDefinition = {
  models: MODELS,
  features: [
    {
      id: 'ownership',
      title: 'Структура власності',
      cells: [cell('outsider', 'Розпорошена'), cell('insider', 'Концентрована', 'src-b', ['src-a']), cell('family', 'Родина засновника')],
    },
    {
      id: 'board',
      title: 'Будова ради',
      cells: [cell('outsider', 'Однорівнева з незалежними'), cell('insider', 'Дворівнева'), cell('family', 'Родина в раді')],
    },
    {
      id: 'employees',
      title: 'Роль працівників',
      cells: [cell('outsider', 'Без місця в раді'), cell('insider', 'Співучасть за законом'), cell('family', 'Неявний контракт')],
    },
  ],
};

export const COMPANY_TASK: CompanyTaskDefinition = {
  id: 'acme',
  company: 'Умовна компанія',
  description: 'Холдинг і земля мають більшість голосів; правління і наглядова рада.',
  answer: 'insider',
  keyFeatures: ['ownership', 'board', 'employees'],
  explanation: 'Концентрована власність і дворівнева рада.',
  source: 'src-b',
};

/** Рубрика «Матриця моделей» з реєстру course.yaml (practicals[p01].rubric[0]). */
export const P01_MATRIX_LEVELS = [
  { points: 1, description: 'Правильно зіставлено не менше 90% ознак і моделей.' },
  { points: 0.5, description: 'Правильно зіставлено 60–89% ознак.' },
  { points: 0, description: 'Правильно зіставлено менше 60% ознак або завдання не виконано.' },
] as const;

export const NOW = new Date('2026-09-17T10:00:00.000Z');
export const LATER = new Date('2026-09-17T10:20:00.000Z');
