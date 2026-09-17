import { describe, expect, it } from 'vitest';
import { LEGACY_514_VI_RULES, QUORUM_CASES, RESOLUTION_CASES } from '../../../engines/calculators/__fixtures__/reference-cases';
import { DEFAULT_MEETING_RULES } from '../../../engines/calculators';
import { createSeededRandom } from '../../../engines/shared/random';
import { MAJORITY_KINDS, calculateQuorumForm, checkQuorumAnswer, createQuorumVariant, majorityLabel, quorumSolution, thresholdText } from './quorum';

const NBSP = '\u00A0';

describe('калькулятор кворуму: розрахунок з полів', () => {
  it('рівно половина — кворуму немає; кроки показують поріг і нестачу', () => {
    const reference = QUORUM_CASES[0];
    const result = calculateQuorumForm({ votingShares: '10 000', registeredShares: '5000', votesFor: '3000', majority: 'simple' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quorum).toEqual(reference.expected);
    expect(result.value.quorumSteps.join(' ')).toContain(`10${NBSP}000 × 1/2 = 5${NBSP}000`);
    expect(result.value.quorumSteps.join(' ')).toContain(`5${NBSP}001`);
    expect(result.value.quorumSteps.at(-1)).toMatch(/кворуму немає, бракує 1 акції/);
    expect(result.value.resolutionSteps.at(-1)).toMatch(/кворуму немає/);
  });

  it('кваліфікована більшість: рівно 3/4 недостатньо', () => {
    const reference = RESOLUTION_CASES[2];
    const result = calculateQuorumForm({ votingShares: '12000', registeredShares: '8000', votesFor: '6000', majority: 'qualified' });
    expect(result.ok && result.value.resolution).toMatchObject(reference.expected);
    expect(result.ok && result.value.resolutionSteps.join(' ')).toContain(`8${NBSP}000 × 3/4 = 6${NBSP}000`);
    expect(result.ok && result.value.resolutionSteps.join(' ')).toMatch(/не прийнято/);
  });

  it('значний правочин: база — загальна кількість голосуючих акцій', () => {
    const result = calculateQuorumForm({ votingShares: '10000', registeredShares: '7000', votesFor: '4500', majority: 'significant-transaction-50' });
    expect(result.ok && result.value.resolution.base).toBe(10_000);
    expect(result.ok && result.value.resolutionSteps[0]).toMatch(/загальна кількість/);
  });

  it('«1,5» читається як число, а рушій пояснює, що акції — цілі; помилки формату — для всіх полів', () => {
    const fractional = calculateQuorumForm({ votingShares: '1,5', registeredShares: '1', votesFor: '1', majority: 'simple' });
    expect(fractional.ok).toBe(false);
    if (!fractional.ok) expect(fractional.error).toEqual([{ field: 'votingShares', message: 'Поле «Кількість голосуючих акцій» має бути цілим числом.' }]);

    const text = calculateQuorumForm({ votingShares: 'багато', registeredShares: '', votesFor: '1', majority: 'simple' });
    expect(!text.ok && text.error.map((issue) => issue.field)).toEqual(['votingShares', 'registeredShares']);
  });

  it('норми з конфігурації: за правилами Закону № 514-VI поріг «не менше 60 %»', () => {
    const rules = { ...DEFAULT_MEETING_RULES, quorum: LEGACY_514_VI_RULES.quorum };
    const result = calculateQuorumForm({ votingShares: '1200000', registeredShares: '660000', votesFor: '1', majority: 'simple' }, rules);
    expect(result.ok && result.value.quorum.requiredShares).toBe(720_000);
    expect(result.ok && result.value.quorumSteps[0]).toMatch(/не менше/);
    expect(thresholdText(LEGACY_514_VI_RULES.quorum)).toBe(`не менше 60${NBSP}%`);
  });

  it('підписи вимог до більшості беруть пороги з рушія', () => {
    expect(majorityLabel('simple')).toBe(`більше 50${NBSP}% голосів зареєстрованих акціонерів`);
    expect(majorityLabel('qualified')).toBe(`більше 75${NBSP}% голосів зареєстрованих акціонерів`);
    expect(majorityLabel('significant-transaction-50')).toBe(`більше 50${NBSP}% від загальної кількості голосуючих акцій`);
    expect(MAJORITY_KINDS).toHaveLength(4);
  });
});

describe('задача про кворум', () => {
  it('варіант відтворюється за зерном і має ID, придатний для прогресу', () => {
    const first = createQuorumVariant(createSeededRandom('q-1'));
    const again = createQuorumVariant(createSeededRandom('q-1'));
    expect(again).toEqual(first);
    expect(first.variantId).toMatch(/^quorum-\d+-\d+-[a-z0-9-]+$/);
    expect(first.variantId.length).toBeLessThanOrEqual(64);
    expect(MAJORITY_KINDS).toContain(first.majority);
  });

  it('правильна відповідь розв’язує задачу, хибна — ні, з розбором кожної частини', () => {
    const variant = createQuorumVariant(createSeededRandom('q-2'));
    const right = checkQuorumAnswer(variant, {
      hasQuorum: variant.quorum.hasQuorum ? 'yes' : 'no',
      requiredShares: String(variant.quorum.requiredShares),
      requiredVotes: String(variant.resolution.requiredVotes),
    });
    expect(right.ok && right.value.solved).toBe(true);

    const wrong = checkQuorumAnswer(variant, {
      hasQuorum: variant.quorum.hasQuorum ? 'no' : 'yes',
      requiredShares: String(variant.quorum.requiredShares - 1),
      requiredVotes: String(variant.resolution.requiredVotes),
    });
    expect(wrong.ok).toBe(true);
    if (!wrong.ok) return;
    expect(wrong.value.solved).toBe(false);
    expect(wrong.value.parts.map((part) => part.correct)).toEqual([false, false, true]);
    expect(quorumSolution(variant).length).toBeGreaterThanOrEqual(4);
  });

  it('неповна відповідь — помилки біля полів', () => {
    const variant = createQuorumVariant(createSeededRandom('q-3'));
    const result = checkQuorumAnswer(variant, { hasQuorum: '', requiredShares: 'x', requiredVotes: '' });
    expect(!result.ok && result.error.map((issue) => issue.field)).toEqual(['hasQuorum', 'requiredShares', 'requiredVotes']);
  });

  it('генератор дає обидва результати кворуму', () => {
    const outcomes = new Set(Array.from({ length: 40 }, (_, index) => createQuorumVariant(createSeededRandom(`spread-${index}`)).quorum.hasQuorum));
    expect(outcomes).toEqual(new Set([true, false]));
  });
});
