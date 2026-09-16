/** Порядок денний, сторінка модуля, список тестів: стан тем, лічильники модулів, результати тестів. */
import type { ProgressState } from '../../engines/progress';
import { formatPercent } from '../../engines/shared/number-format';
import { completedCount, quizIdForTopic, topicQuizText, topicVisualState } from './derive';
import { query, queryAll, renderMark, setText } from './dom';

/** Як у рушії: результат вважається бездоганним, якщо відрізняється від 1 менш ніж на 0,000001. */
const FLAWLESS = 0.999999;

export function renderTopicLinks(state: ProgressState): void {
  queryAll<HTMLAnchorElement>('a.topic[data-topic]').forEach((link) => {
    const topicId = link.dataset['topic'] ?? '';
    const visual = topicVisualState(state, topicId);
    link.dataset['state'] = visual;
    const mark = query('[data-topic-mark]', link);
    if (mark) renderMark(mark, visual);
  });
  queryAll('[data-topic-progress]').forEach((slot) => setText(slot, topicQuizText(state, slot.dataset['topicProgress'] ?? '') ?? ''));
}

function moduleTopicIds(moduleId: string): string[] {
  const scope = query(`[data-module="${moduleId}"]`) ?? document;
  return queryAll<HTMLAnchorElement>('a.topic[data-topic]', scope).map((link) => link.dataset['topic'] ?? '');
}

export function renderModules(state: ProgressState): void {
  queryAll('[data-module-progress]').forEach((meta) => {
    const ids = moduleTopicIds(meta.dataset['moduleProgress'] ?? '');
    if (ids.length > 0) setText(meta, `${completedCount(state, ids)} із ${ids.length}`);
  });

  const card = query('[data-module-progress-card]');
  if (!card) return;
  const ids = moduleTopicIds(card.dataset['moduleProgressCard'] ?? '');
  const done = completedCount(state, ids);
  setText(query('[data-module-progress-label]', card), `${done} із ${ids.length}`);
  const meter = query('[data-module-progress-meter]', card);
  if (meter) {
    meter.setAttribute('aria-valuenow', String(done));
    const fill = query('i', meter);
    if (fill) fill.style.width = ids.length > 0 ? `${(done / ids.length) * 100}%` : '0%';
  }
}

/** Список тестів: найкращий результат і кількість спроб. */
export function renderQuizList(state: ProgressState): void {
  queryAll('[data-quiz-best]').forEach((slot) => {
    const quiz = state.quizzes[quizIdForTopic(slot.dataset['quizBest'] ?? '')];
    setText(slot, quiz ? `найкращий результат ${formatPercent(quiz.bestScore, 0)}` : '');
  });
  queryAll('[data-quiz-best-topic]').forEach((row) => {
    const quiz = state.quizzes[quizIdForTopic(row.dataset['quizBestTopic'] ?? '')];
    const visual = quiz ? (quiz.bestScore > FLAWLESS ? 'done' : 'doing') : 'todo';
    row.dataset['state'] = visual;
    const mark = query('[data-topic-mark]', row);
    if (mark) renderMark(mark, visual);
  });
}
