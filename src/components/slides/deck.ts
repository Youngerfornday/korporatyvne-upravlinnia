/**
 * Поведінка веб-режиму презентації: один слайд на сцені, стрілки/пробіл/Home/End, свайп, номер у адресі (#slide-N),
 * оголошення номера для скрінрідера, нотатки доповідача, повний екран і друк (з нотатками чи без).
 * Розмітку дає Deck.astro; чиста логіка — deck-state.ts.
 */
import { announcement, clampIndex, counterLabel, hashForIndex, indexFromHash, keyAction, swipeAction, type DeckAction } from './deck-state';

/** Відкриті нотатки — зручність одного переглядача, тому localStorage (з префіксом сховища курсу). */
const NOTES_STORAGE_KEY = 'ku:v1:slides-notes';
const PRINT_NOTES_ATTRIBUTE = 'data-print-notes';
const IGNORED_TARGETS = 'input, textarea, select, [contenteditable="true"], dialog[open]';

interface DeckControls {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly frames: readonly HTMLElement[];
  readonly prev: HTMLButtonElement;
  readonly next: HTMLButtonElement;
  readonly count: HTMLElement;
  readonly live: HTMLElement;
  readonly notes: HTMLButtonElement;
  readonly fullscreen: HTMLButtonElement;
}

function readStoredNotes(): boolean {
  try {
    return localStorage.getItem(NOTES_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function storeNotes(open: boolean): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Сховище недоступне: нотатки лишаються відкритими до перезавантаження.
  }
}

function findControls(root: HTMLElement): DeckControls | null {
  const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const stage = pick<HTMLElement>('[data-deck-stage]');
  const prev = pick<HTMLButtonElement>('[data-deck-prev]');
  const next = pick<HTMLButtonElement>('[data-deck-next]');
  const count = pick<HTMLElement>('[data-deck-count]');
  const live = pick<HTMLElement>('[data-deck-live]');
  const notes = pick<HTMLButtonElement>('[data-deck-notes]');
  const fullscreen = pick<HTMLButtonElement>('[data-deck-fullscreen]');
  const frames = [...root.querySelectorAll<HTMLElement>('[data-slide]')];
  if (!stage || !prev || !next || !count || !live || !notes || !fullscreen || frames.length === 0) return null;
  return { root, stage, frames, prev, next, count, live, notes, fullscreen };
}

function setDisabled(button: HTMLButtonElement, disabled: boolean): void {
  // aria-disabled, а не disabled: кнопка з фокусом не втрачає його на першому чи останньому слайді.
  if (disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

function createDeck(controls: DeckControls) {
  const { root, frames } = controls;
  let index = indexFromHash(location.hash, frames.length);

  function show(target: number, options: { announce: boolean; updateHash: boolean }): void {
    const previous = frames[index];
    index = clampIndex(target, frames.length);
    const current = frames[index];
    frames.forEach((frame, position) => frame.toggleAttribute('data-active', position === index));
    controls.count.textContent = counterLabel(index, frames.length);
    setDisabled(controls.prev, index === 0);
    setDisabled(controls.next, index === frames.length - 1);
    if (options.announce) controls.live.textContent = announcement(index, frames.length, current?.dataset['slideHeading'] ?? '');
    if (options.updateHash && location.hash !== hashForIndex(index)) history.replaceState(null, '', hashForIndex(index));
    // Фокус усередині схованого слайда (наприклад, на посиланні норми) переходить на новий слайд, а не губиться.
    if (previous && previous !== current && previous.contains(document.activeElement)) {
      current?.querySelector<HTMLElement>('.slide-box')?.focus();
    }
  }

  function setNotes(open: boolean): void {
    root.toggleAttribute('data-notes-open', open);
    controls.notes.setAttribute('aria-pressed', String(open));
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      // Браузер заборонив повний екран (вбудована сторінка, політика): презентація працює у вікні.
    }
  }

  function run(action: DeckAction): void {
    const move = { announce: true, updateHash: true };
    if (action === 'next') show(index + 1, move);
    else if (action === 'prev') show(index - 1, move);
    else if (action === 'first') show(0, move);
    else if (action === 'last') show(frames.length - 1, move);
    else if (action === 'notes') {
      const open = !root.hasAttribute('data-notes-open');
      setNotes(open);
      storeNotes(open);
    } else void toggleFullscreen();
  }

  return { show, setNotes, run, index: () => index };
}

function bindKeyboard(run: (action: DeckAction) => void): void {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(IGNORED_TARGETS)) return;
    const action = keyAction(event);
    if (action === null) return;
    // Пробіл на кнопці чи посиланні натискає їх, а не гортає.
    if (event.key === ' ' && target?.closest('button, a, summary')) return;
    event.preventDefault();
    run(action);
  });
}

function bindSwipe(stage: HTMLElement, run: (action: DeckAction) => void): void {
  let start: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (event) => {
    start = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', (event) => {
    if (start === null) return;
    const action = swipeAction(event.clientX - start.x, event.clientY - start.y);
    start = null;
    if (action) run(action);
  });
  stage.addEventListener('pointercancel', () => {
    start = null;
  });
}

function bindPrint(root: HTMLElement): void {
  const html = document.documentElement;
  root.querySelector('[data-deck-print]')?.addEventListener('click', () => {
    html.removeAttribute(PRINT_NOTES_ATTRIBUTE);
    window.print();
  });
  root.querySelector('[data-deck-print-notes]')?.addEventListener('click', () => {
    html.setAttribute(PRINT_NOTES_ATTRIBUTE, '');
    window.print();
  });
  window.addEventListener('afterprint', () => html.removeAttribute(PRINT_NOTES_ATTRIBUTE));
}

export function initDeck(): void {
  const root = document.querySelector<HTMLElement>('[data-deck]');
  const controls = root ? findControls(root) : null;
  if (!root || !controls) return;
  const deck = createDeck(controls);

  controls.prev.addEventListener('click', () => deck.run('prev'));
  controls.next.addEventListener('click', () => deck.run('next'));
  controls.notes.addEventListener('click', () => deck.run('notes'));
  controls.fullscreen.addEventListener('click', () => deck.run('fullscreen'));
  if (!document.fullscreenEnabled) controls.fullscreen.hidden = true;
  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === root;
    root.toggleAttribute('data-fullscreen', active);
    controls.fullscreen.setAttribute('aria-pressed', String(active));
  });
  window.addEventListener('hashchange', () => deck.show(indexFromHash(location.hash, controls.frames.length), { announce: true, updateHash: false }));
  bindKeyboard(deck.run);
  bindSwipe(controls.stage, deck.run);
  bindPrint(root);

  deck.setNotes(readStoredNotes());
  deck.show(deck.index(), { announce: false, updateHash: false });
  root.querySelector<HTMLElement>('[data-deck-bar]')?.removeAttribute('hidden');
  root.querySelector<HTMLElement>('[data-deck-hint]')?.removeAttribute('hidden');
  root.setAttribute('data-deck-ready', '');
}
