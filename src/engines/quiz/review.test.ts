import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../shared/random';
import * as fx from './__fixtures__/questions';
import { createLayout } from './layout';
import { reviewQuestion } from './review';
import type { Question, QuestionLayout } from './types';

function createLayoutFor(question: Question): QuestionLayout {
  return createLayout(question, createSeededRandom('review'));
}

describe('reviewQuestion', () => {
  it('multichoice: every option in display order with its own feedback and correctness', () => {
    // Act
    const review = reviewQuestion(fx.single(), { type: 'multichoice', order: [2, 0, 1] }, { type: 'multichoice', selected: [1] });

    // Assert
    expect(review.type).toBe('multichoice');
    if (review.type !== 'multichoice') return;
    expect(review.grade).toEqual({ fraction: 0, state: 'wrong' });
    expect(review.generalFeedback).toBe('Вищий орган АТ — загальні збори акціонерів.');
    expect(review.options.map((option) => [option.index, option.selected, option.isCorrect])).toEqual([
      [2, false, false],
      [0, false, true],
      [1, true, false],
    ]);
    expect(review.options[2]?.feedback).toBe('Наглядова рада контролює виконавчий орган.');
  });

  it('multichoice multi: options with a positive fraction are correct', () => {
    const review = reviewQuestion(fx.multi(), { type: 'multichoice', order: [0, 1, 2] }, null);
    expect(review.grade).toEqual({ fraction: 0, state: 'gaveup' });
    if (review.type !== 'multichoice') return;
    expect(review.options.map((option) => option.isCorrect)).toEqual([true, true, false]);
  });

  it('truefalse: both options with the feedback for the chosen one', () => {
    const review = reviewQuestion(fx.trueFalse(), { type: 'truefalse' }, { type: 'truefalse', value: false });
    if (review.type !== 'truefalse') throw new Error('type');
    expect(review.options).toEqual([
      { value: true, label: 'Правда', selected: false, isCorrect: true, feedback: fx.trueFalse().feedbackTrue },
      { value: false, label: 'Неправда', selected: true, isCorrect: false, feedback: fx.trueFalse().feedbackFalse },
    ]);
    expect(review.feedback).toBe(fx.trueFalse().feedbackFalse);
  });

  it('matching: each stem in display order with the chosen and right answers', () => {
    const review = reviewQuestion(
      fx.matchingSharedAnswer(),
      { type: 'matching', stemOrder: [2, 0, 1], choiceOrder: [1, 2, 0] },
      { type: 'matching', selections: [0, 1, null] },
    );
    if (review.type !== 'matching') throw new Error('type');
    expect(review.choices).toEqual(['Німецька', 'Японська', 'Англо-американська']);
    expect(review.items.map((item) => [item.prompt, item.selectedText, item.correctText, item.isCorrect])).toEqual([
      ['Німеччина', null, 'Німецька', false],
      ['США', 'Англо-американська', 'Англо-американська', true],
      ['Велика Британія', 'Німецька', 'Англо-американська', false],
    ]);
  });

  it('numerical: matched answer feedback and the correct answer with a decimal comma', () => {
    const review = reviewQuestion(fx.numericalGraded(), { type: 'numerical' }, { type: 'numerical', answer: '33' });
    if (review.type !== 'numerical') throw new Error('type');
    expect(review).toMatchObject({ given: '33', matchedAnswer: 1, feedback: 'Близько.', correctAnswerText: '32,5' });
    const miss = reviewQuestion(fx.numericalGraded(), { type: 'numerical' }, { type: 'numerical', answer: '1' });
    expect(miss).toMatchObject({ matchedAnswer: null, feedback: null });
  });

  it('calculated: shows the variant values and the correct answer rounded for display only', () => {
    const question = fx.parseQuestion('calculated', {
      ...fx.calculated(),
      answers: [{ formula: '{p} / {n}', fraction: 100, feedback: 'Так.', correctAnswerLength: 2 }],
      datasets: [
        { name: 'p', min: 1, max: 9, decimals: 0 },
        { name: 'n', min: 1, max: 9, decimals: 0 },
      ],
      stem: 'Поділіть {p} на {n}.',
    });
    const review = reviewQuestion(question, { type: 'calculated', variant: 0, values: { p: 2, n: 3 } }, {
      type: 'calculated',
      answer: '0,667',
    });
    expect(review).toMatchObject({ type: 'calculated', values: { p: 2, n: 3 }, correctAnswerText: '0,67', matchedAnswer: 0 });
    const sig = fx.parseQuestion('calculated', {
      ...question,
      answers: [{ formula: '{p} / {n}', fraction: 100, feedback: 'Так.', correctAnswerLength: 3, correctAnswerFormat: 'significant-figures' }],
    });
    expect(reviewQuestion(sig, { type: 'calculated', variant: 0, values: { p: 2000, n: 3 } }, null)).toMatchObject({
      correctAnswerText: '667',
    });
  });

  it('ddwtos: each gap with chosen and right choice texts and the feedback of the chosen choice', () => {
    const review = reviewQuestion(fx.ddwtosGroups(), { type: 'ddwtos', choiceOrder: [3, 0, 2, 1] }, { type: 'ddwtos', gaps: [3, 1, 2, null] });
    if (review.type !== 'ddwtos') throw new Error('type');
    expect(review.choices.map((choice) => choice.text)).toEqual(['60%', 'понад 50%', 'проста більшість', 'понад 3/4']);
    expect(review.gaps.map((gap) => [gap.selectedText, gap.correctText, gap.isCorrect, gap.feedback])).toEqual([
      ['60%', 'понад 50%', false, 'Стара норма.'],
      ['понад 3/4', 'понад 3/4', true, 'Кваліфікована більшість.'],
      ['проста більшість', 'проста більшість', true, 'Загальне правило.'],
      [null, 'проста більшість', false, null],
    ]);
  });

  it('multianswer: per part grade, given answer, right answer and feedback', () => {
    const review = reviewQuestion(
      fx.clozeWeighted(),
      { type: 'multianswer', partOrders: [[1, 0, 2], null, null] },
      { type: 'multianswer', parts: [1, 'ДКЦПФР', ''] },
    );
    if (review.type !== 'multianswer') throw new Error('type');
    expect(review.parts).toEqual([
      {
        index: 0,
        kind: 'multichoice',
        grade: { fraction: -0.5, state: 'wrong' },
        given: 'аудитор',
        correctText: 'наглядова рада',
        feedback: 'Ні.',
        options: ['аудитор', 'наглядова рада', 'правління'],
      },
      { index: 1, kind: 'shortanswer', grade: { fraction: 0.5, state: 'partial' }, given: 'ДКЦПФР', correctText: 'НКЦПФР', feedback: 'Стара назва.', options: null },
      { index: 2, kind: 'numerical', grade: null, given: null, correctText: '101', feedback: null, options: null },
    ]);
  });

  it('reviews unanswered questions of every type without selections or feedback', () => {
    // Arrange
    const questions = [fx.trueFalse(), fx.matching(), fx.numerical(), fx.calculated(), fx.ddwtos(), fx.clozeWeighted()];

    // Act
    const reviews = questions.map((question) => {
      const layout = question.type === 'calculated' ? { type: 'calculated' as const, variant: 0, values: { p: 1, r: 1, n: 0 } } : undefined;
      return reviewQuestion(question, layout ?? createLayoutFor(question), { type: 'truefalse', value: true });
    });

    // Assert
    expect(reviews[0]).toMatchObject({ type: 'truefalse', feedback: fx.trueFalse().feedbackTrue });
    for (const review of reviews.slice(1)) {
      expect(review.grade.state).toBe('gaveup');
    }
    expect(reviews[1]).toMatchObject({ type: 'matching', items: [{ selectedText: null }, { selectedText: null }] });
    expect(reviews[2]).toMatchObject({ type: 'numerical', given: null, matchedAnswer: null, correctAnswerText: '32,5' });
    expect(reviews[3]).toMatchObject({ type: 'calculated', correctAnswerText: '—', given: null });
    expect(reviews[4]).toMatchObject({ type: 'ddwtos', gaps: [{ selectedText: null }, { selectedText: null }] });
    expect(reviews[5]).toMatchObject({ type: 'multianswer', parts: [{ given: null }, { given: null }, { given: null }] });
  });

  it('refuses a layout of another question type', () => {
    expect(() => reviewQuestion(fx.single(), { type: 'truefalse' }, null)).toThrow(/розкладка/i);
  });
});
