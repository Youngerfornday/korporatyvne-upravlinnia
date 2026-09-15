import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../../shared/random';
import * as fx from '../__fixtures__/questions';
import { createLayout } from '../layout';
import type { Question, QuestionResponse } from '../types';
import { gradeResponse } from './index';

const cases: ReadonlyArray<readonly [Question, QuestionResponse]> = [
  [fx.single(), { type: 'multichoice', selected: [0] }],
  [fx.trueFalse(), { type: 'truefalse', value: true }],
  [fx.matching(), { type: 'matching', selections: [0, 1] }],
  [fx.numerical(), { type: 'numerical', answer: '32,5' }],
  [fx.ddwtos(), { type: 'ddwtos', gaps: [0, 1] }],
  [fx.multianswer(), { type: 'multianswer', parts: [0, '101'] }],
];

describe('gradeResponse', () => {
  it.each(cases)('dispatches %s to its grader', (question, response) => {
    const layout = createLayout(question, createSeededRandom(1));
    expect(gradeResponse(question, layout, response)).toEqual({ fraction: 1, state: 'right' });
  });

  it('grades calculated questions with the variant values of the layout', () => {
    const question = fx.calculated();
    const layout = { type: 'calculated', variant: 0, values: { p: 650, r: 50, n: 10 } } as const;
    expect(gradeResponse(question, layout, { type: 'calculated', answer: '32,5' })).toEqual({ fraction: 1, state: 'right' });
    expect(gradeResponse(question, { type: 'numerical' }, { type: 'calculated', answer: '32,5' }).state).toBe('gaveup');
  });

  it.each(cases)('treats a missing or foreign response to %s as gave up', (question) => {
    const layout = createLayout(question, createSeededRandom(1));
    const foreign: QuestionResponse = question.type === 'truefalse' ? { type: 'numerical', answer: '1' } : { type: 'truefalse', value: true };
    expect(gradeResponse(question, layout, null)).toEqual({ fraction: 0, state: 'gaveup' });
    expect(gradeResponse(question, layout, foreign)).toEqual({ fraction: 0, state: 'gaveup' });
  });
});
