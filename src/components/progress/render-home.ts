/** Головна: кворум (12 комірок), позиція в курсі, наступна тема, CTA «Продовжити». Список тем береться з порядку денного. */
import type { ProgressState } from '../../engines/progress';
import { completedCount, coursePositionText, hasAnyProgress, nextTopicId, topicVisualState, topicsCountText } from './derive';
import { query, queryAll, setText } from './dom';

interface AgendaTopic {
  readonly id: string;
  readonly href: string;
  /** «1. Корпорація і корпоративне управління» — текст із порядку денного. */
  readonly label: string;
  readonly number: number;
  readonly moduleNumber: number;
  readonly numberInModule: number;
}

/** Теми в порядку курсу з розмітки порядку денного (єдине джерело — реєстр, відрендерений сервером). */
export function readAgendaTopics(): AgendaTopic[] {
  return queryAll<HTMLAnchorElement>('[data-agenda] a.topic[data-topic]').map((link, index) => {
    const module = link.closest<HTMLElement>('[data-module]');
    const siblings = module ? queryAll('a.topic[data-topic]', module) : [];
    const moduleNumber = Number(module?.querySelector('.module-name .n')?.textContent?.replace(/\D/g, '') ?? 0);
    return {
      id: link.dataset['topic'] ?? '',
      href: link.href,
      label: (link.querySelector('.topic-title')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      number: index + 1,
      moduleNumber,
      numberInModule: siblings.indexOf(link) + 1,
    };
  });
}

export function renderQuorum(state: ProgressState, topics: readonly AgendaTopic[]): void {
  const panel = query('[data-quorum]');
  if (!panel || topics.length === 0) return;
  const ids = topics.map((topic) => topic.id);
  const total = Number(panel.dataset['total'] ?? ids.length);
  const done = completedCount(state, ids);
  const nextId = nextTopicId(state, ids);
  const next = topics.find((topic) => topic.id === nextId) ?? null;

  queryAll('[data-quorum-cells] i[data-topic]', panel).forEach((cell) => {
    cell.dataset['state'] = topicVisualState(state, cell.dataset['topic'] ?? '');
  });
  query('[data-quorum-cells]', panel)?.setAttribute('aria-label', `Пройдено ${topicsCountText(done, total)}`);
  setText(query('[data-quorum-label]', panel), topicsCountText(done, total));
  setText(query('[data-quorum-position]', panel), coursePositionText(done, total, next?.numberInModule ?? null, next?.moduleNumber ?? null));

  const target = next ?? topics[0];
  if (!target) return;
  setText(query('[data-quorum-next-title]', panel), target.label);
  const link = query<HTMLAnchorElement>('[data-quorum-next-link]', panel);
  if (link) {
    link.href = target.href;
    link.setAttribute('aria-label', `Відкрити тему ${target.number}`);
  }
}

export function renderContinue(state: ProgressState, topics: readonly AgendaTopic[]): void {
  const cta = query<HTMLAnchorElement>('[data-continue]');
  if (!cta || topics.length === 0) return;
  const nextId = nextTopicId(state, topics.map((topic) => topic.id));
  const target = topics.find((topic) => topic.id === nextId) ?? topics[0];
  if (!target) return;
  const verb = nextId === null ? 'Повторити' : hasAnyProgress(state) ? 'Продовжити' : 'Почати';
  cta.href = target.href;
  cta.dataset['topic'] = target.id;
  setText(query('[data-continue-label]', cta), `${verb}: Тема ${target.number}`);
}
