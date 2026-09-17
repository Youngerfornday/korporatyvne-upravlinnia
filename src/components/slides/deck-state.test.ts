import { describe, expect, it } from 'vitest';
import { announcement, clampIndex, counterLabel, hashForIndex, indexFromHash, keyAction, swipeAction } from './deck-state';

const key = (value: string, extra: Partial<{ code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: value,
  code: extra.code ?? '',
  shiftKey: extra.shiftKey ?? false,
  ctrlKey: extra.ctrlKey ?? false,
  metaKey: extra.metaKey ?? false,
  altKey: extra.altKey ?? false,
});

describe('keyAction', () => {
  it('moves forward with arrows, page down and space', () => {
    for (const value of ['ArrowRight', 'ArrowDown', 'PageDown', ' ']) expect(keyAction(key(value))).toBe('next');
  });

  it('moves back with arrows, page up and shift+space', () => {
    for (const value of ['ArrowLeft', 'ArrowUp', 'PageUp']) expect(keyAction(key(value))).toBe('prev');
    expect(keyAction(key(' ', { shiftKey: true }))).toBe('prev');
  });

  it('jumps to the first and the last slide', () => {
    expect(keyAction(key('Home'))).toBe('first');
    expect(keyAction(key('End'))).toBe('last');
  });

  it('toggles notes and fullscreen by physical key, whatever the keyboard layout', () => {
    expect(keyAction(key('т', { code: 'KeyN' }))).toBe('notes');
    expect(keyAction(key('n', { code: 'KeyN' }))).toBe('notes');
    expect(keyAction(key('а', { code: 'KeyF' }))).toBe('fullscreen');
  });

  it('leaves browser shortcuts and other keys alone', () => {
    expect(keyAction(key('ArrowRight', { altKey: true }))).toBeNull();
    expect(keyAction(key('f', { code: 'KeyF', metaKey: true }))).toBeNull();
    expect(keyAction(key('p', { code: 'KeyP', ctrlKey: true }))).toBeNull();
    expect(keyAction(key('Enter'))).toBeNull();
  });
});

describe('indexes and hashes', () => {
  it('keeps the index inside the deck', () => {
    expect(clampIndex(-1, 28)).toBe(0);
    expect(clampIndex(5, 28)).toBe(5);
    expect(clampIndex(40, 28)).toBe(27);
    expect(clampIndex(3, 0)).toBe(0);
    expect(clampIndex(Number.NaN, 28)).toBe(0);
  });

  it('reads a 1-based slide number from the hash', () => {
    expect(indexFromHash('#slide-3', 28)).toBe(2);
    expect(indexFromHash('#slide-99', 28)).toBe(27);
    expect(indexFromHash('#slide-0', 28)).toBe(0);
    expect(indexFromHash('#intro', 28)).toBe(0);
    expect(indexFromHash('', 28)).toBe(0);
  });

  it('writes the hash back', () => {
    expect(hashForIndex(2)).toBe('#slide-3');
  });
});

describe('swipeAction', () => {
  it('turns a horizontal swipe into navigation', () => {
    expect(swipeAction(-80, 10)).toBe('next');
    expect(swipeAction(90, -12)).toBe('prev');
  });

  it('ignores short and mostly vertical gestures', () => {
    expect(swipeAction(-30, 0)).toBeNull();
    expect(swipeAction(-70, 120)).toBeNull();
  });
});

describe('labels', () => {
  it('shows the counter and announces the slide', () => {
    expect(counterLabel(2, 28)).toBe('3 / 28');
    expect(announcement(2, 28, 'Три ознаки корпорації')).toBe('Слайд 3 з 28: Три ознаки корпорації');
  });
});
