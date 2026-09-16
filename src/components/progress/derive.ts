/** Похідні дані зі стану прогресу для гідрації статичних заготовок (чисті функції, без DOM). */
import { levelProgress, type LevelProgress } from '../../engines/gamification';
import { xpLedgerKey, type ProgressState } from '../../engines/progress';
import { formatPercent } from '../../engines/shared/number-format';

export type TopicVisualState = 'todo' | 'doing' | 'done';

export const TOPIC_STATE_LABELS: Readonly<Record<TopicVisualState, string>> = {
  todo: 'Не розпочато',
  doing: 'У процесі',
  done: 'Пройдено',
};

export function quizIdForTopic(topicId: string): string {
  return `${topicId}-training`;
}

export function topicVisualState(state: ProgressState, topicId: string): TopicVisualState {
  const topic = state.topics[topicId];
  if (topic?.status === 'completed') return 'done';
  const started =
    topic !== undefined || state.quizzes[quizIdForTopic(topicId)] !== undefined || state.xpLedger[xpLedgerKey('self-check', topicId)] !== undefined;
  return started ? 'doing' : 'todo';
}

/** Найкращий результат тренувального тесту теми: «тест 87 %» або null. */
export function topicQuizText(state: ProgressState, topicId: string): string | null {
  const quiz = state.quizzes[quizIdForTopic(topicId)];
  return quiz ? `тест ${formatPercent(quiz.bestScore, 0)}` : null;
}

export function completedCount(state: ProgressState, topicIds: readonly string[]): number {
  return topicIds.filter((id) => topicVisualState(state, id) === 'done').length;
}

/** Перша тема, яку ще не пройдено; null — усі пройдено. */
export function nextTopicId(state: ProgressState, topicIds: readonly string[]): string | null {
  return topicIds.find((id) => topicVisualState(state, id) !== 'done') ?? null;
}

export function hasAnyProgress(state: ProgressState): boolean {
  return state.xp > 0 || Object.keys(state.topics).length > 0 || Object.keys(state.quizzes).length > 0;
}

const TOPIC_FORMS = { one: 'тема', few: 'теми', many: 'тем', other: 'теми' } as const;
const pluralRules = new Intl.PluralRules('uk');

export function topicsCountText(done: number, total: number): string {
  const category = pluralRules.select(total);
  const word = category === 'one' || category === 'few' || category === 'many' ? TOPIC_FORMS[category] : TOPIC_FORMS.other;
  return `${done} із ${total} ${word}`;
}

/** Підпис позиції в курсі під кворумом: «Початок курсу», «Модуль 2 · середина», «Кворум зібрано». */
export function coursePositionText(done: number, total: number, nextNumberInModule: number | null, nextModuleNumber: number | null): string {
  if (done === 0) return 'Початок курсу';
  if (done >= total || nextModuleNumber === null) return 'Кворум зібрано';
  const stage = nextNumberInModule === 1 ? 'початок' : nextNumberInModule === 2 ? 'середина' : 'кінець';
  return `Модуль ${nextModuleNumber} · ${stage}`;
}

export function levelSnapshot(state: ProgressState): LevelProgress {
  return levelProgress(state.xp);
}
