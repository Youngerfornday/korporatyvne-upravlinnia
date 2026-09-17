import { describe, expect, it } from 'vitest';
import { CUMULATIVE_CASES, GUARANTEED_SEATS_CASES } from '../../../engines/calculators/__fixtures__/reference-cases';
import { createSeededRandom } from '../../../engines/shared/random';
import { calculateCumulativeForm, checkCumulativeAnswer, createCumulativeVariant, cumulativeSolution } from './cumulative';

const NBSP = '\u00A0';

describe('кумулятивне голосування: розрахунок', () => {
  it('мінімальний пакет для 1 з 5 місць при 600 акціях — 101', () => {
    const reference = CUMULATIVE_CASES[0];
    const result = calculateCumulativeForm({ votingShares: '600', seats: '5', targetSeats: '1', stake: '' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.minimum).toMatchObject(reference.expected);
    expect(result.value.guaranteed).toBeNull();
    expect(result.value.minimumSteps.join(' ')).toContain('600 × 1 / 6 = 100');
    expect(result.value.minimumSteps.join(' ')).toContain('101');
    expect(result.value.guaranteedSteps).toEqual([]);
  });

  it('дробова частка округлюється вниз, потім +1', () => {
    const result = calculateCumulativeForm({ votingShares: '1000', seats: '6', targetSeats: '2', stake: '' });
    expect(result.ok && result.value.minimum.minimumShares).toBe(286);
    expect(result.ok && result.value.minimumSteps[0]).toContain('285,714');
  });

  it('«чи пройде кандидат»: пакет 250 з 600 гарантує 2 місця, трьох кандидатів — ні', () => {
    const reference = GUARANTEED_SEATS_CASES[0];
    const two = calculateCumulativeForm({ votingShares: '600', seats: '5', targetSeats: '2', stake: '250' });
    expect(two.ok && two.value.guaranteed).toBe(reference.expected.seats);
    expect(two.ok && two.value.candidatesPass).toBe(true);

    const three = calculateCumulativeForm({ votingShares: '600', seats: '5', targetSeats: '3', stake: '250' });
    expect(three.ok && three.value.candidatesPass).toBe(false);
    if (!three.ok) return;
    const text = three.value.guaranteedSteps.join(' ');
    expect(text).toContain('600 × 2 / 6 = 200 < 250');
    expect(text).toContain('600 × 3 / 6 = 300 ≥ 250');
    expect(three.value.guaranteedSteps.at(-1)).toMatch(/немає/);
  });

  it('рівно квота — жодного гарантованого місця; повна рада — лише перевірка k = N', () => {
    const quota = calculateCumulativeForm({ votingShares: '600', seats: '5', targetSeats: '1', stake: '100' });
    expect(quota.ok && quota.value.guaranteed).toBe(0);
    expect(quota.ok && quota.value.guaranteedSteps).toHaveLength(3);

    const full = calculateCumulativeForm({ votingShares: '100', seats: '3', targetSeats: '3', stake: '100' });
    expect(full.ok && full.value.guaranteed).toBe(3);
    expect(full.ok && full.value.guaranteedSteps.join(' ')).toContain(`гарантує 3 місця`);
  });

  it('«1,5» у кількості місць — помилка рушія біля поля; пакет більший за акції — теж', () => {
    const fractional = calculateCumulativeForm({ votingShares: '600', seats: '1,5', targetSeats: '1', stake: '' });
    expect(!fractional.ok && fractional.error).toEqual([{ field: 'seats', message: 'Поле «Кількість місць» має бути цілим числом.' }]);

    const tooBig = calculateCumulativeForm({ votingShares: '600', seats: '5', targetSeats: '1', stake: '700' });
    expect(!tooBig.ok && tooBig.error[0]?.field).toBe('stake');

    const target = calculateCumulativeForm({ votingShares: '600', seats: '5', targetSeats: '6', stake: '' });
    expect(!target.ok && target.error[0]?.field).toBe('targetSeats');

    const blank = calculateCumulativeForm({ votingShares: '', seats: '5', targetSeats: '1', stake: 'x' });
    expect(!blank.ok && blank.error.map((issue) => issue.field)).toEqual(['votingShares', 'stake']);
  });

  it('кількість голосів у кроках — з нерозривним пробілом тисяч', () => {
    const result = calculateCumulativeForm({ votingShares: '1000000', seats: '9', targetSeats: '3', stake: '' });
    expect(result.ok && result.value.minimumSteps.join(' ')).toContain(`2${NBSP}700${NBSP}009`);
  });
});

describe('задача про кумулятивне голосування', () => {
  it('варіант відтворюється за зерном; правильна відповідь розв’язує, хибна — ні', () => {
    const variant = createCumulativeVariant(createSeededRandom('c-1'));
    expect(createCumulativeVariant(createSeededRandom('c-1'))).toEqual(variant);
    expect(variant.variantId).toMatch(/^cumulative-\d+-\d+-\d+-\d+$/);

    const right = checkCumulativeAnswer(variant, { minimumShares: String(variant.minimum.minimumShares), passes: variant.passes ? 'yes' : 'no' });
    expect(right.ok && right.value.solved).toBe(true);

    const wrong = checkCumulativeAnswer(variant, { minimumShares: String(variant.minimum.minimumShares - 1), passes: variant.passes ? 'yes' : 'no' });
    expect(wrong.ok && wrong.value.solved).toBe(false);
    expect(cumulativeSolution(variant).length).toBeGreaterThanOrEqual(4);
  });

  it('генератор дає пакети і з гарантією, і без', () => {
    const outcomes = new Set(Array.from({ length: 40 }, (_, index) => createCumulativeVariant(createSeededRandom(`spread-${index}`)).passes));
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('неповна відповідь — помилки біля полів', () => {
    const variant = createCumulativeVariant(createSeededRandom('c-2'));
    const result = checkCumulativeAnswer(variant, { minimumShares: '', passes: '' });
    expect(!result.ok && result.error.map((issue) => issue.field)).toEqual(['minimumShares', 'passes']);
  });
});
