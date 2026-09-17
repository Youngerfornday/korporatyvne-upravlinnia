import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../../engines/gamification';
import { createEmptyProgress } from '../../../engines/progress';
import { ALREADY_SOLVED_TEXT, isVariantSolved, solvedOutcomeText, trainerStatusText } from './xp-text';

const NBSP = '\u00A0';
const level = LEVELS[0]!;
const base = { duplicate: false, xpGained: 0, leveledUp: false, levelAfter: level, newBadges: [] as string[] };

describe('тексти XP тренажерів', () => {
  it('перший розв’язаний варіант — приріст XP; повтор — уже враховано', () => {
    expect(solvedOutcomeText({ ...base, xpGained: 60 })).toBe(`+60${NBSP}XP.`);
    expect(solvedOutcomeText({ ...base, duplicate: true })).toBe(ALREADY_SOLVED_TEXT);
  });

  it('новий варіант після повного XP — зараховано до бейджа, з назвою нового бейджа', () => {
    expect(solvedOutcomeText(base)).toBe(`Варіант зараховано. XP за цей тренажер уже нараховано повністю — 60${NBSP}XP.`);
    expect(solvedOutcomeText({ ...base, newBadges: ['kvorum-zibrano'] })).toMatch(/Отримано 1 новий бейдж: «Кворум зібрано»\.$/);
  });

  it('статус тренажера з прогресу', () => {
    const now = new Date('2026-09-17T10:00:00.000Z');
    const empty = createEmptyProgress(now);
    expect(trainerStatusText(empty, 'quorum-calculator')).toBe(`Розв’язано 0 варіантів · 0${NBSP}XP з 60${NBSP}XP`);

    const state = {
      ...empty,
      xpLedger: { 'trainer:quorum-calculator': 60 },
      activities: { 'quorum-calculator': { attempts: 2, bestScore: 1, solvedVariants: ['a', 'b'] } },
    };
    expect(trainerStatusText(state, 'quorum-calculator')).toBe(`Розв’язано 2 варіанти · 60${NBSP}XP з 60${NBSP}XP`);
    expect(isVariantSolved(state, 'quorum-calculator', 'b')).toBe(true);
    expect(isVariantSolved(state, 'quorum-calculator', 'c')).toBe(false);
    expect(isVariantSolved(empty, 'quorum-calculator', 'a')).toBe(false);
  });
});
