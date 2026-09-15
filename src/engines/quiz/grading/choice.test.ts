import { describe, expect, it } from 'vitest';
import * as fx from '../__fixtures__/questions';
import { ddwtosGaps, gradeDdwtos, gradeMatching, gradeMultichoice, gradeTrueFalse, matchingChoices } from './choice';

describe('gradeMultichoice — single answer (qtype_multichoice_single_question)', () => {
  it('gives the fraction of the chosen answer', () => {
    expect(gradeMultichoice(fx.single(), { type: 'multichoice', selected: [0] })).toEqual({ fraction: 1, state: 'right' });
    expect(gradeMultichoice(fx.single(), { type: 'multichoice', selected: [1] })).toEqual({ fraction: 0, state: 'wrong' });
  });

  it('keeps a negative fraction, exactly as Moodle does not clamp single choice', () => {
    const result = gradeMultichoice(fx.singleWithPenalty(), { type: 'multichoice', selected: [1] });
    expect(result.fraction).toBeCloseTo(-0.3333333, 7);
    expect(result.state).toBe('wrong');
  });

  it('treats no selection as gave up', () => {
    expect(gradeMultichoice(fx.single(), { type: 'multichoice', selected: [] })).toEqual({ fraction: 0, state: 'gaveup' });
  });
});

describe('gradeMultichoice — multiple answers (qtype_multichoice_multi_question)', () => {
  it('sums fractions of the selected answers', () => {
    const question = fx.multiThirds();
    expect(gradeMultichoice(question, { type: 'multichoice', selected: [0, 1] }).fraction).toBeCloseTo(0.6666666, 7);
    expect(gradeMultichoice(question, { type: 'multichoice', selected: [0, 1] }).state).toBe('partial');
  });

  it('counts 3 × 33.33333% as right because it is within 0.000001 of full credit', () => {
    const result = gradeMultichoice(fx.multiThirds(), { type: 'multichoice', selected: [0, 1, 2] });
    expect(result.state).toBe('right');
    expect(result.fraction).toBeCloseTo(0.9999999, 7);
  });

  it('applies penalties and clamps the total to [0, 1]', () => {
    const question = fx.multiThirds();
    expect(gradeMultichoice(question, { type: 'multichoice', selected: [0, 3] })).toEqual({ fraction: 0, state: 'wrong' });
    expect(gradeMultichoice(question, { type: 'multichoice', selected: [0, 1, 2, 3] }).fraction).toBeCloseTo(0.4999999, 7);
    expect(gradeMultichoice(fx.multi(), { type: 'multichoice', selected: [0, 1] })).toEqual({ fraction: 1, state: 'right' });
  });
});

describe('gradeTrueFalse', () => {
  it('is all or nothing', () => {
    expect(gradeTrueFalse(fx.trueFalse(), { type: 'truefalse', value: true })).toEqual({ fraction: 1, state: 'right' });
    expect(gradeTrueFalse(fx.trueFalse(), { type: 'truefalse', value: false })).toEqual({ fraction: 0, state: 'wrong' });
  });
});

describe('matchingChoices', () => {
  it('lists answers then distractors, merging identical texts like qtype_match', () => {
    expect(matchingChoices(fx.matchingSharedAnswer())).toEqual(['Англо-американська', 'Німецька', 'Японська']);
  });
});

describe('gradeMatching (qtype_match_question: right stems / all stems)', () => {
  it('gives partial credit per correct pair', () => {
    const question = fx.matchingSharedAnswer();
    expect(gradeMatching(question, { type: 'matching', selections: [0, 0, 1] })).toEqual({ fraction: 1, state: 'right' });
    const partial = gradeMatching(question, { type: 'matching', selections: [0, 2, null] });
    expect(partial.fraction).toBeCloseTo(1 / 3, 12);
    expect(partial.state).toBe('partial');
  });

  it('is gave up when nothing is matched and wrong when all pairs are wrong', () => {
    const question = fx.matchingSharedAnswer();
    expect(gradeMatching(question, { type: 'matching', selections: [null, null, null] })).toEqual({ fraction: 0, state: 'gaveup' });
    expect(gradeMatching(question, { type: 'matching', selections: [2, 2, 2] })).toEqual({ fraction: 0, state: 'wrong' });
  });
});

describe('ddwtosGaps', () => {
  it('reads [[n]] places in order with the group of the referenced choice', () => {
    expect(ddwtosGaps(fx.ddwtosGroups())).toEqual([
      { choice: 0, group: 1 },
      { choice: 1, group: 2 },
      { choice: 2, group: 2 },
      { choice: 2, group: 2 },
    ]);
  });
});

describe('gradeDdwtos (qtype_gapselect_question_base: right places / all places)', () => {
  it('gives credit per correctly filled gap', () => {
    const question = fx.ddwtosGroups();
    expect(gradeDdwtos(question, { type: 'ddwtos', gaps: [0, 1, 2, 2] })).toEqual({ fraction: 1, state: 'right' });
    expect(gradeDdwtos(question, { type: 'ddwtos', gaps: [3, 1, 2, null] })).toEqual({ fraction: 0.5, state: 'partial' });
  });

  it('is gave up with no gaps filled', () => {
    expect(gradeDdwtos(fx.ddwtos(), { type: 'ddwtos', gaps: [null, null] })).toEqual({ fraction: 0, state: 'gaveup' });
  });
});
