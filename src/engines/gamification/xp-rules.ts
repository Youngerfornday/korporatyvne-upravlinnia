import { xpLedgerKey } from '../progress/state';

/**
 * Правила нарахування XP. Кожна подія нараховує XP сутності (темі, тесту, тренажеру) не більше ніж
 * її найкращий результат: у журналі `xpLedger` зберігається вже нараховане, повтор дає лише приріст.
 * Серій днів і таймерів немає — XP не згорає й не залежить від частоти входів.
 */
export const XP_RULES = {
  /** Тему прочитано до кінця разом із джерелами. */
  topicRead: 100,
  /** Самоперевірку теми пройдено. */
  selfCheck: 20,
  /** Тренувальний тест: 150 × найкраща частка балів. */
  quizMax: 150,
  /** Колода флеш-карток теми: 30 × частка засвоєних карток. */
  flashcardDeck: 30,
  /** Кейс або кейс-гра: 80 × результат. */
  caseMax: 80,
  /** Тренажер практичного заняття (калькулятор, симуляція): 60 × результат. */
  trainerMax: 60,
} as const;

interface EventBase {
  /** Унікальний ID події (наприклад, `quiz:t04-training:1757930400000`) — повтор тієї самої події ігнорується. */
  readonly id: string;
}

export type LearningEvent =
  | (EventBase & { readonly type: 'topic-read'; readonly topicId: string })
  | (EventBase & { readonly type: 'self-check-passed'; readonly topicId: string })
  | (EventBase & { readonly type: 'quiz-finished'; readonly quizId: string; readonly score: number })
  | (EventBase & { readonly type: 'flashcards-reviewed'; readonly deckId: string; readonly mastered: number; readonly total: number })
  | (EventBase & { readonly type: 'case-completed'; readonly caseId: string; readonly score: number })
  | (EventBase & {
      readonly type: 'trainer-completed';
      readonly activityId: string;
      readonly score: number;
      /** ID варіанта задачі; розв’язані без помилок варіанти рахуються для бейджів. */
      readonly variantId?: string;
    });

export interface XpAward {
  readonly key: string;
  readonly amount: number;
}

const ENTITY_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const EVENT_ID = /^[a-z0-9]+(?:[-_:.][a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_EVENT_ID_LENGTH = 120;

const isEntityId = (value: string) => value.length <= MAX_ID_LENGTH && ENTITY_ID.test(value);
const isScore = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

function scaled(max: number, share: number): number {
  return Math.round(max * share);
}

export function awardForEvent(event: LearningEvent): XpAward {
  switch (event.type) {
    case 'topic-read':
      return { key: xpLedgerKey('topic-read', event.topicId), amount: XP_RULES.topicRead };
    case 'self-check-passed':
      return { key: xpLedgerKey('self-check', event.topicId), amount: XP_RULES.selfCheck };
    case 'quiz-finished':
      return { key: xpLedgerKey('quiz', event.quizId), amount: scaled(XP_RULES.quizMax, event.score) };
    case 'flashcards-reviewed':
      return { key: xpLedgerKey('flashcards', event.deckId), amount: scaled(XP_RULES.flashcardDeck, event.mastered / event.total) };
    case 'case-completed':
      return { key: xpLedgerKey('case', event.caseId), amount: scaled(XP_RULES.caseMax, event.score) };
    default:
      return { key: xpLedgerKey('trainer', event.activityId), amount: scaled(XP_RULES.trainerMax, event.score) };
  }
}

function entityOf(event: LearningEvent): string {
  switch (event.type) {
    case 'topic-read':
    case 'self-check-passed':
      return event.topicId;
    case 'quiz-finished':
      return event.quizId;
    case 'flashcards-reviewed':
      return event.deckId;
    case 'case-completed':
      return event.caseId;
    default:
      return event.activityId;
  }
}

/** Повідомлення українською про некоректну подію або null. Подія приходить з UI-острова, тому перевіряємо все. */
export function validateLearningEvent(event: LearningEvent): string | null {
  if (event.id.length > MAX_EVENT_ID_LENGTH || !EVENT_ID.test(event.id)) return 'Некоректний ID події.';
  if (!isEntityId(entityOf(event))) return 'Некоректний ID теми, тесту або тренажера.';
  if ('score' in event && !isScore(event.score)) return 'Результат має бути числом від 0 до 1.';
  if (event.type === 'flashcards-reviewed') {
    const valid = Number.isInteger(event.total) && event.total > 0 && Number.isInteger(event.mastered) && event.mastered >= 0;
    if (!valid || event.mastered > event.total) return 'Кількість засвоєних карток має бути від 0 до кількості карток у колоді.';
  }
  if (event.type === 'trainer-completed' && event.variantId !== undefined && !isEntityId(event.variantId)) {
    return 'Некоректний ID варіанта задачі.';
  }
  return null;
}
