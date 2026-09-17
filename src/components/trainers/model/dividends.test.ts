import { describe, expect, it } from 'vitest';
import { PROFIT_CASES } from '../../../engines/calculators/__fixtures__/reference-cases';
import { createSeededRandom } from '../../../engines/shared/random';
import { calculateDividendForm, checkDividendAnswer, createDividendVariant, dividendSolution, type DividendForm } from './dividends';

const NBSP = '\u00A0';

const MRIIA: DividendForm = {
  netProfit: '2 000 000',
  reserveRate: '5',
  preferredShares: '20000',
  preferredDividendPerShare: '5',
  commonShares: '240000',
  commonPayoutRatio: '40',
  checkNetAssets: true,
  equityBeforeDividends: '12000000',
  statutoryCapital: '10000000',
  reserveCapitalAfter: '600000',
  preferredLiquidationExcess: '200000',
};

describe('дивіденди: розрахунок', () => {
  it('повний каскад «ПАТ Мрія»: резерв → привілейовані → прості → чисті активи', () => {
    const reference = PROFIT_CASES[1];
    const result = calculateDividendForm(MRIIA);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result).toMatchObject({
      reserve: reference.expected.reserve,
      preferredDividends: reference.expected.preferredDividends,
      commonPool: reference.expected.commonPool,
      commonPerShare: reference.expected.commonPerShare,
      totalDividends: reference.expected.totalDividends,
      netAssetsCheck: reference.expected.netAssetsCheck,
    });
    const text = result.value.steps.join(' ');
    expect(text).toContain(`2${NBSP}000${NBSP}000${NBSP}грн × 5${NBSP}% = 100${NBSP}000${NBSP}грн`);
    expect(text).toContain(`3,00${NBSP}грн`);
    expect(text).toContain(`41${NBSP}%`);
    expect(text).toContain(`10${NBSP}800${NBSP}000`);
    expect(result.value.steps.at(-2)).toMatch(/дозволена/);
  });

  it('«1,5» грн на привілейовану акцію приймається; без перевірки чистих активів кроків про капітал немає', () => {
    const result = calculateDividendForm({ ...MRIIA, preferredDividendPerShare: '1,5', checkNetAssets: false, equityBeforeDividends: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result.preferredDividends).toBe(30_000);
    expect(result.value.result.netAssetsCheck).toBeNull();
    expect(result.value.steps.join(' ')).toContain(`20${NBSP}000 × 1,50${NBSP}грн = 30${NBSP}000${NBSP}грн`);
    expect(result.value.steps.join(' ')).not.toMatch(/Мінімальний власний капітал/);
  });

  it('порушення правила чистих активів і недоплата за привілейованими пояснюються в кроках', () => {
    const violation = calculateDividendForm({ ...MRIIA, equityBeforeDividends: '11000000' });
    expect(violation.ok && violation.value.result.netAssetsCheck?.compliant).toBe(false);
    expect(violation.ok && violation.value.steps.join(' ')).toMatch(/не можна/);

    const shortfall = calculateDividendForm({ ...PROFIT_SHORTFALL_FORM });
    expect(shortfall.ok && shortfall.value.result.commonPool).toBe(0);
    expect(shortfall.ok && shortfall.value.steps.join(' ')).toMatch(/недоплата 10\u00A0000\u00A0грн/);
  });

  it('відсотки понад 100 і текст замість числа — помилки біля відповідних полів', () => {
    const over = calculateDividendForm({ ...MRIIA, commonPayoutRatio: '140' });
    expect(!over.ok && over.error).toEqual([{ field: 'commonPayoutRatio', message: 'Поле «Частка прибутку на дивіденди за простими» має бути від 0 до 100%.' }]);

    const text = calculateDividendForm({ ...MRIIA, netProfit: 'мільйон', statutoryCapital: '' });
    expect(!text.ok && text.error.map((issue) => issue.field)).toEqual(['netProfit', 'statutoryCapital']);
  });
});

const PROFIT_SHORTFALL_FORM: DividendForm = {
  netProfit: '100000',
  reserveRate: '10',
  preferredShares: '20000',
  preferredDividendPerShare: '5',
  commonShares: '50000',
  commonPayoutRatio: '50',
  checkNetAssets: false,
  equityBeforeDividends: '',
  statutoryCapital: '',
  reserveCapitalAfter: '',
  preferredLiquidationExcess: '',
};

describe('задача про дивіденди', () => {
  it('варіант відтворюється; чисті активи дають обидва висновки', () => {
    const variant = createDividendVariant(createSeededRandom('d-1'));
    expect(createDividendVariant(createSeededRandom('d-1'))).toEqual(variant);
    expect(variant.variantId).toMatch(/^dividends-[\d-]+-na[01]$/);
    expect(variant.result.netAssetsCheck).not.toBeNull();

    const outcomes = new Set(Array.from({ length: 30 }, (_, index) => createDividendVariant(createSeededRandom(`spread-${index}`)).result.netAssetsCheck?.compliant));
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('правильна відповідь (з округленням до копійки й десятої відсотка) розв’язує задачу; хибна — ні', () => {
    const variant = createDividendVariant(createSeededRandom('d-2'));
    const { result } = variant;
    const right = checkDividendAnswer(variant, {
      commonPerShare: result.commonPerShare.toFixed(2).replace('.', ','),
      totalDividends: String(result.totalDividends),
      payoutPercent: (result.payoutRatio * 100).toFixed(1).replace('.', ','),
      compliant: result.netAssetsCheck?.compliant ? 'yes' : 'no',
    });
    expect(right.ok && right.value.solved).toBe(true);

    const wrong = checkDividendAnswer(variant, {
      commonPerShare: String(result.commonPerShare * 10),
      totalDividends: String(result.totalDividends),
      payoutPercent: String(result.payoutRatio * 100),
      compliant: result.netAssetsCheck?.compliant ? 'yes' : 'no',
    });
    expect(wrong.ok && wrong.value.solved).toBe(false);
    expect(wrong.ok && wrong.value.parts[0]?.correct).toBe(false);
    expect(dividendSolution(variant).length).toBeGreaterThanOrEqual(5);
  });

  it('неповна відповідь — помилки біля полів', () => {
    const variant = createDividendVariant(createSeededRandom('d-3'));
    const result = checkDividendAnswer(variant, { commonPerShare: '', totalDividends: '1', payoutPercent: 'x', compliant: '' });
    expect(!result.ok && result.error.map((issue) => issue.field)).toEqual(['commonPerShare', 'payoutPercent', 'compliant']);
  });
});
