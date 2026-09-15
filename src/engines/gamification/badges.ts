import type { ProgressState } from '../progress/state';

/**
 * ID тренажерів і кейсів, за якими видаються бейджі. Контент і UI-острови мають надсилати події
 * саме з цими ID (`trainer-completed` / `case-completed`).
 */
export const BADGE_ACTIVITY_IDS = {
  quorumCalculator: 'quorum-calculator',
  cumulativeVoting: 'cumulative-voting-calculator',
  dividendDistribution: 'dividend-distribution',
  orderAuction: 'order-auction',
  disclosureChecklist: 'disclosure-checklist',
  threeLines: 'three-lines',
  generalMeeting: 'general-meeting-simulation',
  boardDecision: 'board-decision-game',
} as const;

export interface BadgeDefinition {
  readonly id: string;
  readonly title: string;
  /** Умова в наказовому способі — для нездобутого бейджа («Пройдіть чекліст…»). */
  readonly condition: string;
  /** Опис здобутого бейджа в минулому часі («Пройшли чекліст…»). */
  readonly achievement: string;
  readonly topic: string | null;
  readonly isEarned: (state: ProgressState) => boolean;
}

/** Як і Moodle, вважаємо результат бездоганним, якщо він відрізняється від 1 менш ніж на 0,000001. */
const FLAWLESS = 0.999999;
const QUORUM_SCENARIOS = 3;
const TOPICS_FOR_READER = 5;

function flawless(activityId: string): (state: ProgressState) => boolean {
  return (state) => (state.activities[activityId]?.bestScore ?? 0) > FLAWLESS;
}

export const BADGES: readonly BadgeDefinition[] = Object.freeze([
  {
    id: 'kvorum-zibrano',
    title: 'Кворум зібрано',
    condition: 'Розв’яжіть калькулятор кворуму для трьох різних сценаріїв',
    achievement: 'Розв’язали калькулятор кворуму для трьох різних сценаріїв',
    topic: 't04',
    isEarned: (state) => (state.activities[BADGE_ACTIVITY_IDS.quorumCalculator]?.solvedVariants?.length ?? 0) >= QUORUM_SCENARIOS,
  },
  {
    id: 'kumuliatyvnyi-holos',
    title: 'Кумулятивний голос',
    condition: 'Обчисліть мінімальний пакет для гарантованого місця в раді',
    achievement: 'Обчислили мінімальний пакет для гарантованого місця в раді',
    topic: 't04',
    isEarned: flawless(BADGE_ACTIVITY_IDS.cumulativeVoting),
  },
  {
    id: 'uvazhnyi-chytach',
    title: 'Уважний читач',
    condition: 'Прочитайте п’ять тем до кінця разом із джерелами',
    achievement: 'Прочитали п’ять тем до кінця разом із джерелами',
    topic: null,
    isEarned: (state) => Object.values(state.topics).filter((topic) => topic.status === 'completed').length >= TOPICS_FOR_READER,
  },
  {
    id: 'protokol-pidpysano',
    title: 'Протокол підписано',
    condition: 'Проведіть симуляцію загальних зборів без жодної помилки в підрахунках (тема 4)',
    achievement: 'Провели симуляцію загальних зборів без жодної помилки в підрахунках',
    topic: 't04',
    isEarned: flawless(BADGE_ACTIVITY_IDS.generalMeeting),
  },
  {
    id: 'sumlinnyi-dyrektor',
    title: 'Сумлінний директор',
    condition: 'Завершіть кейс-гру «Рішення ради» найкращим фіналом (тема 6)',
    achievement: 'Завершили кейс-гру «Рішення ради» найкращим фіналом',
    topic: 't06',
    isEarned: flawless(BADGE_ACTIVITY_IDS.boardDecision),
  },
  {
    id: 'dyvidendna-dystsyplina',
    title: 'Дивідендна дисципліна',
    condition: 'Розподіліть прибуток так, щоб чисті активи не впали нижче статутного капіталу (тема 7)',
    achievement: 'Розподілили прибуток, не порушивши правила чистих активів',
    topic: 't07',
    isEarned: flawless(BADGE_ACTIVITY_IDS.dividendDistribution),
  },
  {
    id: 'tsina-vidsikannia',
    title: 'Ціна відсікання',
    condition: 'Визначте ціну аукціону заявок із максимальним обсягом угод (тема 8)',
    achievement: 'Визначили ціну аукціону заявок із максимальним обсягом угод',
    topic: 't08',
    isEarned: flawless(BADGE_ACTIVITY_IDS.orderAuction),
  },
  {
    id: 'prozorist',
    title: 'Прозорість',
    condition: 'Пройдіть чекліст розкриття інформації без жодного пропуску (тема 9)',
    achievement: 'Пройшли чекліст розкриття інформації без жодного пропуску',
    topic: 't09',
    isEarned: flawless(BADGE_ACTIVITY_IDS.disclosureChecklist),
  },
  {
    id: 'try-linii',
    title: 'Три лінії',
    condition: 'Розставте функції компанії по трьох лініях захисту без помилок (тема 10)',
    achievement: 'Розставили функції компанії по трьох лініях захисту без помилок',
    topic: 't10',
    isEarned: flawless(BADGE_ACTIVITY_IDS.threeLines),
  },
]);

/** ID усіх бейджів, умови яких виконано в стані (незалежно від того, чи їх уже видано). */
export function earnedBadgeIds(state: ProgressState): string[] {
  return BADGES.filter((badge) => badge.isEarned(state)).map((badge) => badge.id);
}

export function findBadge(id: string): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.id === id);
}
