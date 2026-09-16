import { describe, expect, test } from 'vitest';
import { createEmptyProgress, type ProgressState } from '../../engines/progress';
import { completedCount, coursePositionText, hasAnyProgress, nextTopicId, topicQuizText, topicVisualState, topicsCountText } from './derive';

const NOW = new Date('2026-09-10T10:00:00Z');

function stateWith(patch: Partial<ProgressState>): ProgressState {
  return { ...createEmptyProgress(NOW), ...patch };
}

describe('topicVisualState', () => {
  test('порожній стан — усе «не розпочато»', () => {
    expect(topicVisualState(createEmptyProgress(NOW), 't01')).toBe('todo');
  });

  test('завершена тема — done, розпочата — doing', () => {
    const state = stateWith({
      topics: { t01: { status: 'completed', updatedAt: NOW.toISOString() }, t02: { status: 'in-progress', updatedAt: NOW.toISOString() } },
    });
    expect(topicVisualState(state, 't01')).toBe('done');
    expect(topicVisualState(state, 't02')).toBe('doing');
  });

  test('пройдений тест або самоперевірка без прочитаної лекції — doing', () => {
    const quizzes = stateWith({ quizzes: { 't03-training': { attempts: 1, bestScore: 0.5, lastAttemptAt: NOW.toISOString() } } });
    const selfCheck = stateWith({ xpLedger: { 'self-check:t04': 20 } });
    expect(topicVisualState(quizzes, 't03')).toBe('doing');
    expect(topicVisualState(selfCheck, 't04')).toBe('doing');
  });
});

describe('лічильники й наступна тема', () => {
  const ids = ['t01', 't02', 't03'];
  const state = stateWith({ topics: { t01: { status: 'completed', updatedAt: NOW.toISOString() } } });

  test('рахує пройдені й знаходить першу непройдену', () => {
    expect(completedCount(state, ids)).toBe(1);
    expect(nextTopicId(state, ids)).toBe('t02');
    expect(nextTopicId(createEmptyProgress(NOW), ids)).toBe('t01');
  });

  test('усі пройдено — наступної немає', () => {
    const all = stateWith({
      topics: Object.fromEntries(ids.map((id) => [id, { status: 'completed', updatedAt: NOW.toISOString() }])),
    });
    expect(nextTopicId(all, ids)).toBeNull();
  });

  test('hasAnyProgress — лише коли є XP, теми або тести', () => {
    expect(hasAnyProgress(createEmptyProgress(NOW))).toBe(false);
    expect(hasAnyProgress(state)).toBe(true);
  });
});

describe('тексти', () => {
  test('кількість тем відмінюється', () => {
    expect(topicsCountText(1, 12)).toBe('1 із 12 тем');
    expect(topicsCountText(0, 3)).toBe('0 із 3 теми');
    expect(topicsCountText(1, 1)).toBe('1 із 1 тема');
  });

  test('позиція в курсі', () => {
    expect(coursePositionText(0, 12, 1, 1)).toBe('Початок курсу');
    expect(coursePositionText(1, 12, 2, 1)).toBe('Модуль 1 · середина');
    expect(coursePositionText(3, 12, 1, 2)).toBe('Модуль 2 · початок');
    expect(coursePositionText(5, 12, 3, 2)).toBe('Модуль 2 · кінець');
    expect(coursePositionText(12, 12, null, null)).toBe('Кворум зібрано');
  });

  test('результат тесту теми у відсотках без дробової частини', () => {
    const state = stateWith({ quizzes: { 't01-training': { attempts: 1, bestScore: 0.874, lastAttemptAt: NOW.toISOString() } } });
    expect(topicQuizText(state, 't01')).toBe('тест 87 %');
    expect(topicQuizText(state, 't02')).toBeNull();
  });
});
