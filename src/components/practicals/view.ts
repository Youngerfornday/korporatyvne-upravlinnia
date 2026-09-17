/**
 * Розкладка сторінки практичної за видом тренажера: розділи змісту, чип XP у шапці й речення про
 * обсяг тренажера в умові. Чисті функції — сторінка лише підставляє числа зі свого файлу даних.
 */
import { pluralUk } from '../../lib/plural';

export type PracticalTrainerKind = 'model-matrix' | 'legal-form-choice';

export interface PracticalSection {
  readonly id: string;
  readonly label: string;
}

const COMMON_HEAD: readonly PracticalSection[] = [
  { id: 'meta', label: 'Мета і результати' },
  { id: 'umova', label: 'Умова' },
];

const COMMON_TAIL: readonly PracticalSection[] = [
  { id: 'ese', label: 'Есе' },
  { id: 'rubryka', label: 'Рубрика' },
];

const TRAINER_SECTIONS: Readonly<Record<PracticalTrainerKind, readonly PracticalSection[]>> = {
  'model-matrix': [
    { id: 'trenazher', label: 'Тренажер-матриця' },
    { id: 'kompanii', label: 'Визначте модель компанії' },
  ],
  'legal-form-choice': [
    { id: 'trenazher', label: 'Тренажер: форма і динаміка' },
    { id: 'startapy', label: 'Стартапи для обґрунтування' },
    { id: 'dohovir', label: 'Корпоративний договір' },
  ],
};

const DATA_SECTION: Readonly<Record<PracticalTrainerKind, PracticalSection>> = {
  'model-matrix': { id: 'dani', label: 'Моделі, дані й джерела' },
  'legal-form-choice': { id: 'dani', label: 'Статистика, норми й джерела' },
};

export function practicalSections(kind: PracticalTrainerKind): readonly PracticalSection[] {
  return [...COMMON_HEAD, ...TRAINER_SECTIONS[kind], ...COMMON_TAIL, DATA_SECTION[kind]];
}

export function practicalXpChip(kind: PracticalTrainerKind): string {
  return kind === 'model-matrix' ? 'до 60 XP за матрицю' : 'до 60 XP за задачі тренажера';
}

export interface MatrixNoteInput {
  readonly features: number;
  readonly models: number;
  readonly cells: number;
  readonly rubricTitle: string;
}

export function matrixConditionNote({ features, models, cells, rubricTitle }: MatrixNoteInput): string {
  return `У тренажері — ${features} ознак × ${models} моделі = ${cells} формулювань. Перша спроба навчальна, оцінюється друга: бал за критерієм «${rubricTitle}» рубрики нижче.`;
}

export interface LegalFormNoteInput {
  readonly criteria: number;
  readonly forms: number;
  readonly points: number;
  readonly registryForms: number;
}

const CRITERION_FORMS = { one: 'параметр', few: 'параметри', many: 'параметрів', other: 'параметра' } as const;
const FORM_FORMS = { one: 'форма', few: 'форми', many: 'форм', other: 'форми' } as const;
const DATE_FORMS = { one: 'дата', few: 'дати', many: 'дат', other: 'дати' } as const;

export function legalFormConditionNote({ criteria, forms, points, registryForms }: LegalFormNoteInput): string {
  /** Пари дат «раніша → пізніша» без повторів, помножені на кількість показників ряду. */
  const variants = ((points * (points - 1)) / 2) * registryForms;
  return (
    `У конструкторі — ${pluralUk(criteria, CRITERION_FORMS)} стартапу і ${pluralUk(forms, FORM_FORMS)} на вибір: ` +
    `кожен наслідок підписаний нормою з датою перевірки. У задачі — ${pluralUk(points, DATE_FORMS)} ряду ЄДРПОУ, ` +
    `тобто ${variants} можливих варіантів; XP нараховуються за кожен новий варіант, розв’язаний повністю правильно.`
  );
}
