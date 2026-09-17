/**
 * Чиста логіка веб-режиму презентації: клавіші, свайп, номер слайда в адресі, підписи.
 * DOM і події — у deck.ts; тут лише перетворення, які можна перевірити без браузера.
 */

export type DeckAction = 'next' | 'prev' | 'first' | 'last' | 'notes' | 'fullscreen';

export interface KeyInput {
  readonly key: string;
  /** Фізична клавіша: `KeyN` однаковий в українській і англійській розкладці. */
  readonly code: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);
/** Мінімальна довжина свайпу в CSS-пікселях: коротший рух — це дотик, а не гортання. */
export const SWIPE_MIN_PX = 50;
const HASH = /^#slide-(\d+)$/;

export function keyAction(input: KeyInput): DeckAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.key === ' ') return input.shiftKey ? 'prev' : 'next';
  if (NEXT_KEYS.has(input.key)) return 'next';
  if (PREV_KEYS.has(input.key)) return 'prev';
  if (input.key === 'Home') return 'first';
  if (input.key === 'End') return 'last';
  if (input.code === 'KeyN') return 'notes';
  if (input.code === 'KeyF') return 'fullscreen';
  return null;
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0 || Number.isNaN(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** `#slide-3` → 2; будь-що інше — перший слайд. Елементів з таким id немає, тож браузер не прокручує сторінку до слайда. */
export function indexFromHash(hash: string, count: number): number {
  const match = HASH.exec(hash);
  return match ? clampIndex(Number(match[1]) - 1, count) : 0;
}

export function hashForIndex(index: number): string {
  return `#slide-${index + 1}`;
}

/** Горизонтальний свайп довший за поріг і переважно горизонтальний: вліво — далі, вправо — назад. */
export function swipeAction(dx: number, dy: number): 'next' | 'prev' | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? 'next' : 'prev';
}

export function counterLabel(index: number, count: number): string {
  return `${index + 1} / ${count}`;
}

export function announcement(index: number, count: number, heading: string): string {
  return `Слайд ${index + 1} з ${count}: ${heading}`;
}
