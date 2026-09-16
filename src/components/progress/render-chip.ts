/** Чип рівня в шапці, підсумок у мобільному меню, сходинки рівнів на головній. */
import { formatXp, levelPositionText, nextLevelText } from '../../engines/gamification';
import type { ProgressState } from '../../engines/progress';
import { levelSnapshot } from './derive';
import { query, queryAll, setText } from './dom';

export function renderPlayerChip(state: ProgressState, persistent: boolean): void {
  const progress = levelSnapshot(state);
  const xpText = formatXp(state.xp);

  queryAll('[data-player-chip]').forEach((chip) => {
    chip.dataset['levelId'] = progress.level.id;
    chip.dataset['xp'] = String(state.xp);
    setText(query('[data-player-level]', chip), progress.level.title);
    setText(query('[data-player-xp]', chip), xpText);
    setText(query('[data-player-sr]', chip), `Ваш рівень: ${progress.level.title}, ${xpText}. ${nextLevelText(progress)}`);
  });

  const storageNote = persistent ? 'Прогрес зберігається у вашому браузері.' : 'Сховище браузера недоступне: прогрес живе лише до закриття вкладки.';
  queryAll('[data-player-summary]').forEach((summary) => setText(summary, `${progress.level.title} · ${xpText}. ${levelPositionText(progress)}. ${storageNote}`));
}

export function renderLadder(state: ProgressState): void {
  const ladder = query('[data-ladder]');
  if (!ladder) return;
  const current = levelSnapshot(state).level.id;
  queryAll('.rung[data-level-id]', ladder).forEach((rung) => {
    const isNow = rung.dataset['levelId'] === current;
    if (isNow) {
      rung.setAttribute('data-now', '');
      rung.setAttribute('aria-current', 'step');
    } else {
      rung.removeAttribute('data-now');
      rung.removeAttribute('aria-current');
    }
    query('.hex', rung)?.classList.toggle('is-off', !isNow);
    const label = query('b', rung);
    const marker = label?.querySelector('.rung-now');
    if (isNow && label && !marker) {
      const span = document.createElement('span');
      span.className = 'faint rung-now';
      span.textContent = '— ви тут';
      label.append(' ', span);
    } else if (!isNow && marker) {
      marker.remove();
    }
  });
}
