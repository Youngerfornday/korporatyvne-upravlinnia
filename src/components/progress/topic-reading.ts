/**
 * Сторінка теми: «у процесі» при відкритті лекції, «тему прочитано» — коли останній розділ статті
 * потрапив у видиму область (IntersectionObserver, один раз), самоперевірка — XP після всіх відповідей.
 */
import type { LearningEvent } from '../../engines/gamification';
import type { SelfCheckDetail } from '../topic/selfcheck';
import type { ProgressClient } from './client';
import { query, queryAll } from './dom';

const READ_EVENT_PREFIX = 'topic-read';
const SELF_CHECK_EVENT_PREFIX = 'self-check';
/** Частина останнього розділу, яку треба побачити, щоб зарахувати читання. */
const LAST_SECTION_THRESHOLD = 0.4;

function topicReadEvent(topicId: string): LearningEvent {
  return { id: `${READ_EVENT_PREFIX}:${topicId}`, type: 'topic-read', topicId };
}

function selfCheckEvent(topicId: string): LearningEvent {
  return { id: `${SELF_CHECK_EVENT_PREFIX}:${topicId}`, type: 'self-check-passed', topicId };
}

/** Останній змістовий блок статті: усе, крім пейджера сусідніх тем. */
function lastSection(article: HTMLElement): Element | null {
  const children = Array.from(article.children).filter((child) => !child.classList.contains('pager'));
  return children[children.length - 1] ?? null;
}

function observeReadToEnd(article: HTMLElement, onRead: () => void): void {
  const target = lastSection(article);
  if (!target) return;
  if (!('IntersectionObserver' in window)) {
    onRead();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      onRead();
    },
    { threshold: Math.min(LAST_SECTION_THRESHOLD, 1) },
  );
  observer.observe(target);
}

export function initTopicReading(client: ProgressClient): void {
  const page = query('[data-topic-page]');
  const topicId = page?.dataset['topic'];
  if (!page || !topicId) return;
  const article = query('[data-topic-article]', page);
  if (!article) return;

  client.markTopicInProgress(topicId);
  if (client.getState().topics[topicId]?.status !== 'completed') {
    observeReadToEnd(article, () => {
      if (client.getState().topics[topicId]?.status === 'completed') return;
      client.apply(topicReadEvent(topicId));
    });
  }
}

/** Лише теми реєстру (t01…t12): демонстраційна самоперевірка вітрини компонентів XP не дає. */
const TOPIC_ID = /^t\d{2}$/;

export function initSelfCheckAwards(client: ProgressClient): void {
  document.addEventListener('ku:selfcheck', (event) => {
    const detail = (event as CustomEvent<SelfCheckDetail>).detail;
    const topicId = detail?.topic ?? query('[data-topic-page]')?.dataset['topic'];
    if (!topicId || !TOPIC_ID.test(topicId) || detail.total === 0 || detail.answered < detail.total) return;
    client.apply(selfCheckEvent(topicId));
  });
}

/** Підпис у боковій панелі теми після нарахування: «XP нараховано» замість підказки. */
export function renderTopicSideNote(client: ProgressClient): void {
  const page = query('[data-topic-page]');
  const topicId = page?.dataset['topic'];
  if (!page || !topicId) return;
  const state = client.getState();
  const read = state.topics[topicId]?.status === 'completed';
  const checked = state.xpLedger[`${SELF_CHECK_EVENT_PREFIX}:${topicId}`] !== undefined;
  queryAll('[data-topic-xp-note]', page).forEach((note) => {
    note.textContent = read && checked ? 'XP за тему й самоперевірку нараховано' : read ? 'Тему прочитано; XP за самоперевірку — після всіх відповідей' : 'XP нараховуються після самоперевірки';
  });
}
