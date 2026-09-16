/**
 * Точка входу гідрації прогресу (BaseLayout). Серверний стан усіх заготовок — «0»; після завантаження
 * стану з localStorage тексти й атрибути підмінюються без зміни макета. Оновлення — за подією ku:progress.
 */
import { eventOutcomeText, type EventOutcome } from '../../engines/gamification';
import { getProgressClient, type ProgressChangeDetail, type ProgressClient } from './client';
import { readAgendaTopics, renderContinue, renderQuorum } from './render-home';
import { renderLadder, renderPlayerChip } from './render-chip';
import { renderModules, renderQuizList, renderTopicLinks } from './render-topics';
import { outcomeToastHtml } from './toast-text';
import { initSelfCheckAwards, initTopicReading, renderTopicSideNote } from './topic-reading';

function announce(outcome: EventOutcome): void {
  const html = outcomeToastHtml(outcome);
  if (!html) return;
  document.dispatchEvent(new CustomEvent('ku:toast', { detail: { html } }));
  // Повний текст події — для скрінрідера через окремий status-регіон, бо тост показує лише коротке резюме.
  const live = document.getElementById('progress-live');
  if (live) live.textContent = eventOutcomeText(outcome);
}

let storageWarned = false;
function warnStorage(client: ProgressClient): void {
  if (storageWarned || client.isPersistent()) return;
  storageWarned = true;
  document.dispatchEvent(
    new CustomEvent('ku:toast', { detail: { text: 'Сховище браузера недоступне: прогрес збережеться лише до закриття вкладки.' } }),
  );
}

function renderAll(client: ProgressClient, detail: Pick<ProgressChangeDetail, 'state' | 'persistent'>): void {
  const { state, persistent } = detail;
  renderPlayerChip(state, persistent);
  renderLadder(state);
  const agenda = readAgendaTopics();
  renderQuorum(state, agenda);
  renderContinue(state, agenda);
  renderTopicLinks(state);
  renderModules(state);
  renderQuizList(state);
  renderTopicSideNote(client);
}

export function initProgress(): void {
  const client = getProgressClient();
  renderAll(client, { state: client.getState(), persistent: client.isPersistent() });

  client.subscribe((detail) => {
    renderAll(client, detail);
    if (detail.outcome) announce(detail.outcome);
    warnStorage(client);
  });

  initTopicReading(client);
  initSelfCheckAwards(client);
}
