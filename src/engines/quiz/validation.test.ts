import { describe, expect, it } from 'vitest';
import * as fx from './__fixtures__/questions';
import { validateResponse } from './validation';

const code = (issue: ReturnType<typeof validateResponse>) => issue?.code ?? null;

describe('validateResponse', () => {
  it('rejects a response of another question type', () => {
    expect(code(validateResponse(fx.single(), { type: 'truefalse', value: true }))).toBe('type-mismatch');
  });

  it('checks multichoice selections', () => {
    expect(validateResponse(fx.single(), { type: 'multichoice', selected: [1] })).toBeNull();
    expect(code(validateResponse(fx.single(), { type: 'multichoice', selected: [] }))).toBe('incomplete');
    expect(code(validateResponse(fx.single(), { type: 'multichoice', selected: [0, 1] }))).toBe('invalid-choice');
    expect(code(validateResponse(fx.multi(), { type: 'multichoice', selected: [] }))).toBe('incomplete');
    expect(code(validateResponse(fx.multi(), { type: 'multichoice', selected: [0, 0] }))).toBe('duplicate-choice');
    expect(code(validateResponse(fx.multi(), { type: 'multichoice', selected: [7] }))).toBe('invalid-choice');
    expect(code(validateResponse(fx.multi(), { type: 'multichoice', selected: [1.5] }))).toBe('invalid-choice');
  });

  it('accepts any true/false answer', () => {
    expect(validateResponse(fx.trueFalse(), { type: 'truefalse', value: false })).toBeNull();
  });

  it('requires every matching pair to be answered with an existing choice', () => {
    const question = fx.matchingSharedAnswer();
    expect(validateResponse(question, { type: 'matching', selections: [0, 0, 1] })).toBeNull();
    expect(code(validateResponse(question, { type: 'matching', selections: [0, null, 1] }))).toBe('incomplete');
    expect(code(validateResponse(question, { type: 'matching', selections: [0, 1] }))).toBe('incomplete');
    expect(code(validateResponse(question, { type: 'matching', selections: [0, 9, 1] }))).toBe('invalid-choice');
  });

  it('checks numbers the way Moodle validates numerical responses', () => {
    expect(validateResponse(fx.numerical(), { type: 'numerical', answer: '32,5' })).toBeNull();
    expect(code(validateResponse(fx.numerical(), { type: 'numerical', answer: ' ' }))).toBe('incomplete');
    expect(code(validateResponse(fx.numerical(), { type: 'numerical', answer: 'багато' }))).toBe('invalid-number');
    expect(code(validateResponse(fx.calculated(), { type: 'calculated', answer: '12 грн' }))).toBe('number-with-unit');
  });

  it('checks drag-and-drop gaps: complete, same group, finite choices used once', () => {
    const question = fx.ddwtosGroups();
    expect(validateResponse(question, { type: 'ddwtos', gaps: [0, 1, 2, 2] })).toBeNull();
    expect(code(validateResponse(question, { type: 'ddwtos', gaps: [0, 1, 2, null] }))).toBe('incomplete');
    expect(code(validateResponse(question, { type: 'ddwtos', gaps: [1, 1, 2, 2] }))).toBe('wrong-group');
    expect(code(validateResponse(question, { type: 'ddwtos', gaps: [0, 1, 1, 2] }))).toBe('duplicate-choice');
    expect(code(validateResponse(question, { type: 'ddwtos', gaps: [0, 1, 2, 8] }))).toBe('invalid-choice');
  });

  it('checks every Cloze part and names the part number', () => {
    const question = fx.clozeWeighted();
    expect(validateResponse(question, { type: 'multianswer', parts: [0, 'НКЦПФР', '101'] })).toBeNull();
    expect(validateResponse(question, { type: 'multianswer', parts: [0, 'НКЦПФР', ''] })).toMatchObject({ code: 'incomplete', part: 3 });
    expect(validateResponse(question, { type: 'multianswer', parts: [5, 'НКЦПФР', '1'] })).toMatchObject({
      code: 'invalid-choice',
      part: 1,
    });
    expect(validateResponse(question, { type: 'multianswer', parts: [0, 'НКЦПФР', 'сто'] })).toMatchObject({
      code: 'invalid-number',
      part: 3,
    });
    expect(validateResponse(question, { type: 'multianswer', parts: [0, 3, '1'] })).toMatchObject({ code: 'incomplete', part: 2 });
  });

  it('gives a Ukrainian message for every issue', () => {
    const issue = validateResponse(fx.numerical(), { type: 'numerical', answer: 'x' });
    expect(issue?.message).toMatch(/число/);
  });
});
