import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../shared/random';
import * as fx from './__fixtures__/questions';
import { answerQuestion, finishAttempt, startAttempt, type QuizAttempt } from './attempt';
import { attemptSummaryText, summarizeAttempt, toScormCmiValues, toScormReport } from './report';
import type { Question, QuestionResponse } from './types';

const NOW = new Date('2026-09-15T10:00:00.000Z');
const NBSP = '\u00A0';

function run(questions: readonly Question[], responses: Record<string, QuestionResponse>): QuizAttempt {
  let attempt = startAttempt({ quizId: 't04-training', questions, random: createSeededRandom('r'), now: NOW });
  attempt.slots.forEach((slot, index) => {
    const response = responses[slot.questionId];
    if (!response) return;
    const result = answerQuestion(attempt, questions, index, response, NOW);
    if (!result.ok) throw new Error(result.error.message);
    attempt = result.value;
  });
  return finishAttempt(attempt, questions, NOW);
}

describe('summarizeAttempt', () => {
  it('sums marks as fraction × question mark, like question_usage_by_activity::get_total_mark', () => {
    // Arrange
    const questions = [fx.single(), fx.trueFalse(), { ...fx.multiThirds(), defaultMark: 2 }];

    // Act
    const summary = summarizeAttempt(
      run(questions, {
        't04-q001': { type: 'multichoice', selected: [0] },
        't05-q102': { type: 'multichoice', selected: [0, 1] },
      }),
    );

    // Assert
    expect(summary.maxMarks).toBe(4);
    expect(summary.marks).toBeCloseTo(1 + 2 * 0.6666666, 6);
    expect(summary.percent).toBe(58.33);
    expect(summary.score).toBeCloseTo(summary.marks / 4, 12);
    expect(summary.counts).toEqual({ right: 1, partial: 1, wrong: 0, gaveup: 1, unanswered: 0 });
    expect(summary.quizId).toBe('t04-training');
  });

  it('keeps a negative Moodle total but clamps the stored score and SCORM raw score', () => {
    // Act
    const summary = summarizeAttempt(run([fx.singleWithPenalty()], { 't04-q101': { type: 'multichoice', selected: [1] } }));
    const report = toScormReport(summary);

    // Assert
    expect(summary.fraction).toBeLessThan(0);
    expect(summary.percent).toBe(-33.33);
    expect(summary.score).toBe(0);
    expect(report.scoreRaw).toBe(0);
  });

  it('counts unanswered slots of an attempt still in progress', () => {
    const attempt = startAttempt({ quizId: 'q', questions: [fx.trueFalse()], random: createSeededRandom(1), now: NOW });
    expect(summarizeAttempt(attempt).counts).toEqual({ right: 0, partial: 0, wrong: 0, gaveup: 0, unanswered: 1 });
    expect(summarizeAttempt(attempt).finishedAt).toBeNull();
  });
});

describe('toScormReport and toScormCmiValues', () => {
  const questions = [fx.single(), fx.trueFalse()];
  const summary = () => summarizeAttempt(run(questions, { 't04-q001': { type: 'multichoice', selected: [0] } }));

  it('reports score.raw on 0–100 and completed without a mastery score', () => {
    expect(toScormReport(summary())).toEqual({ scoreRaw: 50, scoreMin: 0, scoreMax: 100, lessonStatus: 'completed' });
  });

  it('reports passed or failed against a pass percent', () => {
    expect(toScormReport(summary(), { passPercent: 50 }).lessonStatus).toBe('passed');
    expect(toScormReport(summary(), { passPercent: 60 }).lessonStatus).toBe('failed');
  });

  it('reports incomplete while the attempt is not finished', () => {
    const attempt = startAttempt({ quizId: 'q', questions, random: createSeededRandom(1), now: NOW });
    expect(toScormReport(summarizeAttempt(attempt), { passPercent: 60 }).lessonStatus).toBe('incomplete');
  });

  it('maps to SCORM 1.2 CMI string values', () => {
    expect(toScormCmiValues(toScormReport(summary()))).toEqual({
      'cmi.core.score.raw': '50',
      'cmi.core.score.min': '0',
      'cmi.core.score.max': '100',
      'cmi.core.lesson_status': 'completed',
    });
  });
});

describe('attemptSummaryText', () => {
  it('describes marks with Ukrainian plural forms and uk-UA numbers', () => {
    const questions = [fx.single(), fx.trueFalse(), { ...fx.multiThirds(), defaultMark: 3 }];
    const summary = summarizeAttempt(
      run(questions, {
        't04-q001': { type: 'multichoice', selected: [0] },
        't01-q003': { type: 'truefalse', value: true },
        't05-q102': { type: 'multichoice', selected: [0] },
      }),
    );
    expect(attemptSummaryText(summary)).toBe(`Ви отримали 3 бали з 5 можливих (60${NBSP}%). Правильно: 2 з 3 питань.`);
  });
});
