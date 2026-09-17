/**
 * Каталог тренажерів і практичних на сайті: шляхи (без base — його додає сторінка через url()),
 * ID активностей прогресу (збігаються з BADGE_ACTIVITY_IDS рушія геймифікації) і зв’язок з реєстром
 * course.yaml → practicals[].trainers.
 */
import { BADGE_ACTIVITY_IDS } from '../../engines/gamification';
import { matrixActivityId } from '../../engines/matrix';

export type CalculatorKey = 'quorum' | 'cumulative' | 'dividends';

export interface CalculatorTrainer {
  readonly key: CalculatorKey;
  readonly slug: string;
  readonly path: string;
  readonly activityId: string;
  readonly practicalId: string;
  /** ID тренажера в реєстрі course.yaml (practicals[].trainers). */
  readonly registryId: string;
  /** Бейдж рушія геймифікації, який дає цей тренажер. */
  readonly badgeId: string;
  readonly icon: string;
  readonly title: string;
  readonly text: string;
  readonly formula: string;
}

export const CALCULATOR_TRAINERS: readonly CalculatorTrainer[] = [
  {
    key: 'quorum',
    slug: 'kvorum',
    path: 'trenazhery/kvorum/',
    activityId: BADGE_ACTIVITY_IDS.quorumCalculator,
    practicalId: 'p03',
    registryId: 'quorum',
    badgeId: 'kvorum-zibrano',
    icon: 'scale',
    title: 'Кворум і голосування',
    text: 'Чи відбудуться збори, якщо зареєструвалося 48,7\u00A0% голосуючих акцій, і скільки треба для рішення про зміну статуту.',
    formula: 'Кворум: понад 50\u00A0% голосуючих акцій',
  },
  {
    key: 'cumulative',
    slug: 'kumuliatyvne-holosuvannia',
    path: 'trenazhery/kumuliatyvne-holosuvannia/',
    activityId: BADGE_ACTIVITY_IDS.cumulativeVoting,
    practicalId: 'p03',
    registryId: 'cumulative-voting',
    badgeId: 'kumuliatyvnyi-holos',
    icon: 'target',
    title: 'Кумулятивне голосування',
    text: 'Мінімальний пакет, щоб гарантовано провести k своїх кандидатів у раду з N місць, і чи пройдуть кандидати з вашим пакетом.',
    formula: 'S·k / (N + 1) + 1 акція',
  },
  {
    key: 'dividends',
    slug: 'dyvidendy',
    path: 'trenazhery/dyvidendy/',
    activityId: BADGE_ACTIVITY_IDS.dividendDistribution,
    practicalId: 'p05',
    registryId: 'profit-distribution',
    badgeId: 'dyvidendna-dystsyplina',
    icon: 'calc',
    title: 'Дивіденди й чисті активи',
    text: 'Розподіл прибутку між привілейованими і простими акціями та перевірка, чи дозволяє виплату розмір власного капіталу.',
    formula: 'ВК після виплати ≥ СК + РК + ΔЛВ',
  },
];

/** Практичні, сторінки яких уже опубліковано (`praktychni/pNN/`). */
export const PUBLISHED_PRACTICALS: readonly string[] = ['p01'];

export const MATRIX_TRAINER = {
  practicalId: 'p01',
  registryId: 'model-matrix',
  activityId: matrixActivityId('p01'),
  path: 'praktychni/p01/#trenazher',
  icon: 'layers',
  title: 'Матриця моделей корпоративного управління',
  text: 'Зіставте формулювання ознак з чотирма моделями: перша спроба навчальна з розбором кожної клітинки, друга оцінюється за рубрикою.',
  formula: 'Не менше 90\u00A0% зіставлень — 1 бал',
} as const;

/** Людські назви тренажерів з реєстру course.yaml. */
export const TRAINER_KIND_LABELS: Readonly<Record<string, string>> = {
  'model-matrix': 'матриця моделей (зіставлення)',
  'legal-form-choice': 'вибір форми бізнесу',
  quorum: 'калькулятор кворуму',
  'cumulative-voting': 'кумулятивне голосування',
  'board-matrix': 'матриця компетенцій ради',
  'transaction-approval': 'погодження правочинів',
  'profit-distribution': 'розподіл прибутку',
  auction: 'аукціон заявок',
  bonds: 'облігації і доходність',
  'risk-map': 'карта ризиків',
  'disclosure-checklist': 'чекліст розкриття',
  dupont: 'модель DuPont',
  'governance-scorecard': 'скоринг-картка',
};

export function trainerKindLabel(registryId: string): string {
  return Object.hasOwn(TRAINER_KIND_LABELS, registryId) ? (TRAINER_KIND_LABELS[registryId] ?? registryId) : registryId;
}

export interface PublishedTrainerLink {
  readonly registryId: string;
  readonly path: string;
  readonly title: string;
  readonly activityId: string;
}

/** Опубліковані тренажери за ID реєстру (без base). */
export function publishedTrainer(registryId: string): PublishedTrainerLink | null {
  if (registryId === MATRIX_TRAINER.registryId) {
    return { registryId, path: MATRIX_TRAINER.path, title: MATRIX_TRAINER.title, activityId: MATRIX_TRAINER.activityId };
  }
  const calculator = CALCULATOR_TRAINERS.find((trainer) => trainer.registryId === registryId);
  return calculator ? { registryId, path: calculator.path, title: calculator.title, activityId: calculator.activityId } : null;
}

export interface PracticalRef {
  readonly id: string;
  readonly topics: readonly string[];
  readonly trainers: readonly string[];
}

/** ID активностей опублікованих тренажерів практичних, до яких належить тема (для карти проходження). */
export function topicTrainerActivityIds(practicals: readonly PracticalRef[], topicId: string): string[] {
  const ids = practicals
    .filter((practical) => practical.topics.includes(topicId))
    .flatMap((practical) => practical.trainers)
    .map((registryId) => publishedTrainer(registryId)?.activityId)
    .filter((id): id is string => id !== undefined);
  return [...new Set(ids)];
}

export function practicalPath(practicalId: string): string {
  return `praktychni/${practicalId}/`;
}

/** «П1» з p01. */
export function practicalLabel(practicalId: string): string {
  return `П${Number.parseInt(practicalId.replace(/^p/, ''), 10)}`;
}
