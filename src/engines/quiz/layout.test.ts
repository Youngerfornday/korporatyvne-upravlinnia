import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../shared/random';
import * as fx from './__fixtures__/questions';
import { generateDatasetItems } from './grading/numeric';
import { createLayout } from './layout';

const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b);

describe('createLayout', () => {
  it('shuffles multichoice answers deterministically and keeps every index', () => {
    // Arrange
    const question = fx.multiThirds();

    // Act
    const first = createLayout(question, createSeededRandom('s1'));
    const again = createLayout(question, createSeededRandom('s1'));

    // Assert
    expect(first).toEqual(again);
    expect(first.type === 'multichoice' && sorted(first.order)).toEqual([0, 1, 2, 3]);
  });

  it('keeps bank order when shuffling within questions is off or the question forbids it', () => {
    const noShuffle = fx.parseQuestion('multichoice', { ...fx.multiThirds(), shuffleAnswers: false });
    expect(createLayout(noShuffle, createSeededRandom(1))).toEqual({ type: 'multichoice', order: [0, 1, 2, 3] });
    expect(createLayout(fx.multiThirds(), createSeededRandom(1), { shuffleWithinQuestions: false })).toEqual({
      type: 'multichoice',
      order: [0, 1, 2, 3],
    });
  });

  it('shuffles matching choices always and stems only when allowed, like qtype_match', () => {
    const question = fx.parseQuestion('matching', { ...fx.matchingSharedAnswer(), shuffleAnswers: false });
    const layouts = Array.from({ length: 12 }, (_, seed) => createLayout(question, createSeededRandom(seed)));
    for (const layout of layouts) {
      expect(layout.type === 'matching' && layout.stemOrder).toEqual([0, 1, 2]);
      expect(layout.type === 'matching' && sorted(layout.choiceOrder)).toEqual([0, 1, 2]);
    }
    const choiceOrders = new Set(layouts.map((layout) => (layout.type === 'matching' ? layout.choiceOrder.join() : '')));
    expect(choiceOrders.size).toBeGreaterThan(1);
  });

  it('shuffles ddwtos choices within each group and lists groups in ascending order', () => {
    const layout = createLayout(fx.ddwtosGroups(), createSeededRandom('g'));
    expect(layout.type).toBe('ddwtos');
    if (layout.type !== 'ddwtos') return;
    const groups = layout.choiceOrder.map((index) => fx.ddwtosGroups().choices[index]?.group);
    expect(groups).toEqual([1, 1, 2, 2]);
    expect(sorted(layout.choiceOrder)).toEqual([0, 1, 2, 3]);
  });

  it('picks a calculated variant from the stable dataset items', () => {
    const question = fx.calculated();
    const layout = createLayout(question, createSeededRandom('v'));
    expect(layout.type).toBe('calculated');
    if (layout.type !== 'calculated') return;
    expect(layout.variant).toBeGreaterThanOrEqual(0);
    expect(layout.variant).toBeLessThan(question.itemCount);
    expect(layout.values).toEqual(generateDatasetItems(question)[layout.variant]);
  });

  it('prepares an order only for shuffled Cloze multichoice parts', () => {
    const layout = createLayout(fx.clozeWeighted(), createSeededRandom('c'));
    expect(layout.type).toBe('multianswer');
    if (layout.type !== 'multianswer') return;
    expect(layout.partOrders[0] && sorted(layout.partOrders[0])).toEqual([0, 1, 2]);
    expect(layout.partOrders.slice(1)).toEqual([null, null]);
    const unshuffled = createLayout(fx.multianswer(), createSeededRandom('c'));
    expect(unshuffled).toEqual({ type: 'multianswer', partOrders: [[0, 1], null] });
  });

  it('needs no randomness for truefalse and numerical', () => {
    expect(createLayout(fx.trueFalse(), createSeededRandom(0))).toEqual({ type: 'truefalse' });
    expect(createLayout(fx.numerical(), createSeededRandom(0))).toEqual({ type: 'numerical' });
  });
});
