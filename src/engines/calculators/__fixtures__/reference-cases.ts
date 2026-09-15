/**
 * Еталонні приклади калькуляторів із розписаним розрахунком. Їх незалежно перераховує рецензент,
 * тому кожен крок записано явно, а суми грошей — до копійки. Норми — Закон України «Про акціонерні
 * товариства» № 2465-IX (docs/research/legal-baseline.md, розділ 1).
 */
import type { MeetingRules } from '../meeting-rules';

export interface ReferenceCase<I, E> {
  readonly id: string;
  readonly title: string;
  /** Норма або джерело правила. */
  readonly basis: string;
  readonly input: I;
  readonly expected: E;
  readonly calculation: readonly string[];
}

/** Правила Закону № 514-VI (втратив чинність 01.01.2023) — лише щоб показати, що норми задаються конфігурацією. */
export const LEGACY_514_VI_RULES: Pick<MeetingRules, 'quorum'> = {
  quorum: { numerator: 3, denominator: 5, strict: false },
};

export const QUORUM_CASES = [
  {
    id: 'quorum-exactly-half',
    title: 'Рівно 50% зареєстрованих голосуючих акцій — кворуму немає',
    basis: 'ст. 40 ч. 1 Закону № 2465-IX: більше 50% голосуючих акцій',
    input: { votingShares: 10_000, registeredShares: 5_000 },
    expected: { hasQuorum: false, requiredShares: 5_001, shortfall: 1, registeredShare: 0.5 },
    calculation: ['Поріг: 10 000 × 1/2 = 5 000; «більше» → 5 000 + 1 = 5 001 акція.', '5 000 < 5 001 → кворуму немає, бракує 1 акції.'],
  },
  {
    id: 'quorum-one-share-over',
    title: 'На одну акцію більше половини — кворум є',
    basis: 'ст. 40 ч. 1 Закону № 2465-IX',
    input: { votingShares: 10_000, registeredShares: 5_001 },
    expected: { hasQuorum: true, requiredShares: 5_001, shortfall: 0, registeredShare: 0.5001 },
    calculation: ['Поріг 5 001 (див. попередній приклад).', '5 001 ≥ 5 001 → кворум є; частка 5 001 / 10 000 = 50,01%.'],
  },
  {
    id: 'quorum-55-percent',
    title: '55% — кворум за чинним законом (за старим Законом № 514-VI було б замало)',
    basis: 'ст. 40 ч. 1 Закону № 2465-IX; порівняння зі ст. 41 Закону № 514-VI (60%, не менше)',
    input: { votingShares: 1_200_000, registeredShares: 660_000 },
    expected: { hasQuorum: true, requiredShares: 600_001, shortfall: 0, registeredShare: 0.55 },
    calculation: [
      'Чинна норма: 1 200 000 × 1/2 = 600 000; більше → 600 001; 660 000 ≥ 600 001 → кворум є.',
      'Стара норма (не менше 60%): 1 200 000 × 3/5 = 720 000; 660 000 < 720 000 → кворуму не було б.',
    ],
  },
] as const;

export const LEGACY_QUORUM_CASE = {
  id: 'quorum-legacy-60',
  title: 'Та сама ситуація за правилами Закону № 514-VI (60%, не менше)',
  basis: 'Закон № 514-VI, втратив чинність 01.01.2023 — лише для порівняння',
  input: { votingShares: 1_200_000, registeredShares: 660_000 },
  expected: { hasQuorum: false, requiredShares: 720_000, shortfall: 60_000, registeredShare: 0.55 },
  calculation: ['1 200 000 × 3/5 = 720 000 (не менше → рівно 720 000).', '720 000 − 660 000 = 60 000 акцій бракує.'],
} as const;

export const RESOLUTION_CASES = [
  {
    id: 'simple-majority-adopted',
    title: 'Проста більшість: 3 101 голос «за» із 6 200 зареєстрованих',
    basis: 'ст. 53 ч. 4 Закону № 2465-IX: більше 50% голосів зареєстрованих акціонерів',
    input: { votingShares: 10_000, registeredShares: 6_200, votesFor: 3_101, majority: 'simple' },
    expected: { adopted: true, base: 6_200, requiredVotes: 3_101 },
    calculation: ['База — зареєстровані: 6 200.', '6 200 × 1/2 = 3 100; більше → 3 101.', '3 101 ≥ 3 101 → рішення прийнято.'],
  },
  {
    id: 'simple-majority-tie',
    title: 'Рівно половина голосів — рішення не прийнято',
    basis: 'ст. 53 ч. 4 Закону № 2465-IX',
    input: { votingShares: 10_000, registeredShares: 6_200, votesFor: 3_100, majority: 'simple' },
    expected: { adopted: false, base: 6_200, requiredVotes: 3_101 },
    calculation: ['Потрібно 3 101 (див. попередній приклад).', '3 100 < 3 101 → не прийнято.'],
  },
  {
    id: 'qualified-exactly-three-quarters',
    title: 'Зміни статуту: рівно 3/4 — недостатньо',
    basis: 'ст. 53 ч. 4 Закону № 2465-IX: більш як 3/4 голосів зареєстрованих (п. 2–10, 20, 29 ч. 2 ст. 39)',
    input: { votingShares: 12_000, registeredShares: 8_000, votesFor: 6_000, majority: 'qualified' },
    expected: { adopted: false, base: 8_000, requiredVotes: 6_001 },
    calculation: ['8 000 × 3/4 = 6 000; «більш як» → 6 001.', '6 000 < 6 001 → зміни статуту не прийнято.'],
  },
  {
    id: 'preemptive-waiver-95',
    title: 'Невикористання переважного права: більше 95%',
    basis: 'ст. 53 ч. 4 Закону № 2465-IX (п. 21 ч. 2 ст. 39)',
    input: { votingShares: 25_000, registeredShares: 20_000, votesFor: 19_001, majority: 'preemptive-waiver' },
    expected: { adopted: true, base: 20_000, requiredVotes: 19_001 },
    calculation: ['20 000 × 95/100 = 19 000; більше → 19 001.', '19 001 ≥ 19 001 → прийнято.'],
  },
  {
    id: 'significant-transaction-total-base',
    title: 'Значний правочин на 50% активів і більше: база — усі голосуючі акції, а не зареєстровані',
    basis: 'ст. 106 ч. 3 Закону № 2465-IX: більш як 50% голосів акціонерів від їх загальної кількості',
    input: { votingShares: 10_000, registeredShares: 7_000, votesFor: 4_500, majority: 'significant-transaction-50' },
    expected: { adopted: false, base: 10_000, requiredVotes: 5_001 },
    calculation: [
      'База — загальна кількість голосуючих акцій: 10 000; поріг 10 000 × 1/2 = 5 000 → 5 001.',
      '4 500 голосів — це 64,29% зареєстрованих, але лише 45% загальної кількості → не прийнято.',
    ],
  },
] as const;

export const CUMULATIVE_CASES = [
  {
    id: 'cumulative-600-5-1',
    title: '600 акцій, 5 місць, гарантувати 1 місце',
    basis: 'Математичне правило S·k/(N+1)+1 (законом не встановлене; механіка — ст. 53 ч. 5 Закону № 2465-IX)',
    input: { votingShares: 600, seats: 5, targetSeats: 1 },
    expected: { minimumShares: 101, cumulativeVotes: 505 },
    calculation: ['S·k/(N+1) = 600 × 1 / 6 = 100.', 'floor(100) + 1 = 101 акція.', 'Кумулятивних голосів: 101 × 5 = 505.'],
  },
  {
    id: 'cumulative-1m-9-3',
    title: '1 000 000 акцій, 9 місць, гарантувати 3 місця',
    basis: 'S·k/(N+1)+1',
    input: { votingShares: 1_000_000, seats: 9, targetSeats: 3 },
    expected: { minimumShares: 300_001, cumulativeVotes: 2_700_009 },
    calculation: ['1 000 000 × 3 / 10 = 300 000.', '300 000 + 1 = 300 001 акція.', 'Голосів: 300 001 × 9 = 2 700 009.'],
  },
  {
    id: 'cumulative-full-board',
    title: 'Увесь склад ради: 100 акцій, 3 місця з 3',
    basis: 'S·k/(N+1)+1, граничний випадок k = N',
    input: { votingShares: 100, seats: 3, targetSeats: 3 },
    expected: { minimumShares: 76, cumulativeVotes: 228 },
    calculation: ['100 × 3 / 4 = 75.', '75 + 1 = 76 акцій (не 75: за 75 проти 25 суперник може зрівнятися на третьому місці).'],
  },
  {
    id: 'cumulative-single-seat',
    title: 'Одне місце: формула дає звичайну більшість',
    basis: 'S·k/(N+1)+1, граничний випадок N = 1',
    input: { votingShares: 10, seats: 1, targetSeats: 1 },
    expected: { minimumShares: 6, cumulativeVotes: 6 },
    calculation: ['10 × 1 / 2 = 5.', '5 + 1 = 6 — більше половини.'],
  },
  {
    id: 'cumulative-fractional-quotient',
    title: 'Частка не ціла: 1 000 акцій, 6 місць, 2 місця',
    basis: 'S·k/(N+1)+1 з округленням униз',
    input: { votingShares: 1_000, seats: 6, targetSeats: 2 },
    expected: { minimumShares: 286, cumulativeVotes: 1_716 },
    calculation: ['1 000 × 2 / 7 = 285,714…', 'floor(285,714…) + 1 = 286.', 'Голосів: 286 × 6 = 1 716.'],
  },
] as const;

export const GUARANTEED_SEATS_CASES = [
  {
    id: 'guaranteed-250-of-600',
    title: 'Скільки місць гарантує пакет 250 із 600 акцій при 5 місцях',
    basis: 'Обернене правило: найбільше k, для якого пакет > S·k/(N+1)',
    input: { votingShares: 600, seats: 5, stake: 250 },
    expected: { seats: 2 },
    calculation: ['Для k = 2: 600 × 2 / 6 = 200 < 250 → гарантовано.', 'Для k = 3: 600 × 3 / 6 = 300 ≥ 250 → ні.', 'Відповідь: 2 місця.'],
  },
  {
    id: 'guaranteed-exact-quota',
    title: 'Рівно квота 100 із 600 — жодного гарантованого місця',
    basis: 'Обернене правило',
    input: { votingShares: 600, seats: 5, stake: 100 },
    expected: { seats: 0 },
    calculation: ['Для k = 1: 600 / 6 = 100, а пакет має бути більшим за 100.', 'Відповідь: 0.'],
  },
] as const;

export const PROFIT_CASES = [
  {
    id: 'profit-old-course-error',
    title: 'Дивіденд на акцію: 32,50 грн (у старому курсі помилково «325»)',
    basis: 'ст. 34 ч. 1 Закону № 2465-IX: дивіденд — частина чистого прибутку на одну акцію',
    input: { netProfit: 650_000, reserveRate: 0, preferredShares: 0, preferredDividendPerShare: 0, commonShares: 10_000, commonPayoutRatio: 0.5 },
    expected: {
      reserve: 0,
      preferredDividends: 0,
      commonPool: 325_000,
      commonPerShare: 32.5,
      totalDividends: 325_000,
      retainedEarnings: 325_000,
      payoutRatio: 0.5,
    },
    calculation: ['650 000 × 0,5 = 325 000 грн на дивіденди.', '325 000 / 10 000 = 32,50 грн на акцію.'],
  },
  {
    id: 'profit-full-waterfall',
    title: 'Резерв → привілейовані → прості, частки держави й міноритаріїв, правило чистих активів (за мотивами «ПАТ Мрія»)',
    basis: 'ст. 16 ч. 4–5, ст. 34, ст. 35 ч. 1 Закону № 2465-IX',
    input: {
      netProfit: 2_000_000,
      reserveRate: 0.05,
      preferredShares: 20_000,
      preferredDividendPerShare: 5,
      commonShares: 240_000,
      commonPayoutRatio: 0.4,
      holders: [
        { id: 'state', label: 'Держава', commonShares: 144_000 },
        { id: 'minority', label: 'Міноритарії', commonShares: 96_000 },
        { id: 'preferred-fund', label: 'Власник привілейованих акцій', commonShares: 0, preferredShares: 20_000 },
      ],
      netAssets: { equityBeforeDividends: 12_000_000, statutoryCapital: 10_000_000, reserveCapitalAfter: 600_000, preferredLiquidationExcess: 200_000 },
    },
    expected: {
      reserve: 100_000,
      afterReserve: 1_900_000,
      preferredDividends: 100_000,
      preferredShortfall: 0,
      commonPool: 720_000,
      commonPerShare: 3,
      totalDividends: 820_000,
      retainedEarnings: 1_080_000,
      payoutRatio: 0.41,
      holders: [
        { id: 'state', amount: 432_000, shareOfDividends: 432_000 / 820_000 },
        { id: 'minority', amount: 288_000, shareOfDividends: 288_000 / 820_000 },
        { id: 'preferred-fund', amount: 100_000, shareOfDividends: 100_000 / 820_000 },
      ],
      netAssetsCheck: { equityAfter: 11_180_000, minimumEquity: 10_800_000, compliant: true, maximumCommonDividends: 1_100_000 },
    },
    calculation: [
      'Резерв: 2 000 000 × 0,05 = 100 000; залишок 1 900 000.',
      'Привілейовані: 20 000 × 5 = 100 000; залишок 1 800 000.',
      'Прості: 1 800 000 × 0,4 = 720 000; на акцію 720 000 / 240 000 = 3,00 грн.',
      'Усього дивідендів 820 000; нерозподілений прибуток 1 900 000 − 820 000 = 1 080 000; дивідендний вихід 820 000 / 2 000 000 = 41%.',
      'Держава: 144 000 × 3 = 432 000 (52,68% дивідендів); міноритарії: 96 000 × 3 = 288 000; привілейовані: 100 000.',
      'Мінімальний власний капітал: 10 000 000 + 600 000 + 200 000 = 10 800 000; після виплати 12 000 000 − 820 000 = 11 180 000 ≥ 10 800 000 → можна.',
      'Максимум за простими: 12 000 000 − 100 000 − 10 800 000 = 1 100 000.',
    ],
  },
  {
    id: 'profit-net-assets-violation',
    title: 'Та сама виплата при власному капіталі 11 000 000 порушує правило чистих активів',
    basis: 'ст. 35 ч. 1 п. 2 Закону № 2465-IX',
    input: {
      netProfit: 2_000_000,
      reserveRate: 0.05,
      preferredShares: 20_000,
      preferredDividendPerShare: 5,
      commonShares: 240_000,
      commonPayoutRatio: 0.4,
      netAssets: { equityBeforeDividends: 11_000_000, statutoryCapital: 10_000_000, reserveCapitalAfter: 600_000, preferredLiquidationExcess: 200_000 },
    },
    expected: {
      netAssetsCheck: { equityAfter: 10_180_000, minimumEquity: 10_800_000, compliant: false, maximumCommonDividends: 100_000 },
    },
    calculation: [
      'Після виплати: 11 000 000 − 820 000 = 10 180 000 < 10 800 000 → рішення про дивіденди за простими прийняти не можна.',
      'Максимум за простими: 11 000 000 − 100 000 − 10 800 000 = 100 000.',
    ],
  },
  {
    id: 'profit-preferred-shortfall',
    title: 'Прибутку не вистачає на привілейовані — за простими не платять',
    basis: 'ст. 35 ч. 2 Закону № 2465-IX: не можна платити за простими, якщо не сповна виплачено за привілейованими',
    input: { netProfit: 100_000, reserveRate: 0.1, preferredShares: 20_000, preferredDividendPerShare: 5, commonShares: 50_000, commonPayoutRatio: 0.5 },
    expected: { reserve: 10_000, afterReserve: 90_000, preferredDividends: 90_000, preferredShortfall: 10_000, commonPool: 0, commonPerShare: 0 },
    calculation: ['Резерв 10 000; залишок 90 000.', 'Потрібно 20 000 × 5 = 100 000, є 90 000 → недоплата 10 000.', 'Прості: 0.'],
  },
] as const;

export const DUPONT_CASES = [
  {
    id: 'dupont-ukrmetal',
    title: 'Трифакторна модель DuPont (за мотивами «Укрметал»)',
    basis: 'ROA = ROS × оборотність активів; ROE = ROA × мультиплікатор капіталу',
    input: { revenue: 50_000_000, netIncome: 4_000_000, averageAssets: 40_000_000, averageEquity: 16_000_000 },
    expected: { returnOnSales: 0.08, assetTurnover: 1.25, returnOnAssets: 0.1, equityMultiplier: 2.5, returnOnEquity: 0.25 },
    calculation: [
      'ROS = 4 000 000 / 50 000 000 = 0,08.',
      'Оборотність = 50 000 000 / 40 000 000 = 1,25.',
      'ROA = 0,08 × 1,25 = 0,10 (перевірка: 4 000 000 / 40 000 000 = 0,10).',
      'Мультиплікатор = 40 000 000 / 16 000 000 = 2,5.',
      'ROE = 0,10 × 2,5 = 0,25 (перевірка: 4 000 000 / 16 000 000 = 0,25).',
    ],
  },
] as const;

export const GROWTH_CASES = [
  {
    id: 'growth-cost-outpaces-revenue',
    title: 'Собівартість росте швидше за виручку',
    basis: 'Темп зростання = поточне / попереднє; темп приросту = темп зростання − 1',
    input: { revenue: { previous: 50_000_000, current: 57_500_000 }, cost: { previous: 40_000_000, current: 47_000_000 } },
    expected: {
      revenue: { absoluteChange: 7_500_000, growthIndex: 1.15, growthRate: 0.15 },
      cost: { absoluteChange: 7_000_000, growthIndex: 1.175, growthRate: 0.175 },
      costGrowsFaster: true,
      gapPercentagePoints: -2.5,
    },
    calculation: [
      'Виручка: 57 500 000 / 50 000 000 = 1,15 → приріст 15%.',
      'Собівартість: 47 000 000 / 40 000 000 = 1,175 → приріст 17,5%.',
      'Різниця: 15 − 17,5 = −2,5 п. п. → собівартість випереджає виручку.',
    ],
  },
] as const;

export const SECURITIES_CASES = {
  eps: {
    id: 'eps-with-preferred',
    title: 'Прибуток на просту акцію з урахуванням привілейованих дивідендів',
    basis: 'EPS = (чистий прибуток − дивіденди за привілейованими) / середньозважена кількість простих акцій',
    input: { netIncome: 4_000_000, preferredDividends: 400_000, weightedCommonShares: 1_200_000 },
    expected: 3,
    calculation: ['(4 000 000 − 400 000) / 1 200 000 = 3,00 грн.'],
  },
  priceEarnings: {
    id: 'pe-15',
    title: 'P/E',
    basis: 'P/E = ціна акції / EPS',
    input: { price: 45, eps: 3 },
    expected: 15,
    calculation: ['45 / 3 = 15.'],
  },
  dividendYield: {
    id: 'dividend-yield-3',
    title: 'Дивідендна доходність',
    basis: 'Дивіденд на акцію / ціна акції',
    input: { dividendPerShare: 1.35, price: 45 },
    expected: 0.03,
    calculation: ['1,35 / 45 = 0,03 = 3%.'],
  },
  bondAnnual: {
    id: 'bond-annual-discount',
    title: 'Облігація нижче номіналу: номінал 1 000, купон 10% щороку, 3 роки, ринкова ставка 12%',
    basis: 'P = Σ C/(1+r)^t + F/(1+r)^n',
    input: { faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 3, marketRate: 0.12, periodsPerYear: 1 },
    expected: 951.9633746355682,
    calculation: ['100 / 1,12 = 89,2857.', '100 / 1,12² = 79,7194.', '1 100 / 1,12³ = 782,9583.', 'Разом: 951,96 грн.'],
  },
  bondSemiannual: {
    id: 'bond-semiannual',
    title: 'Піврічний купон: номінал 1 000, купон 8% річних, 2 роки, ринкова ставка 10%',
    basis: 'C = F·c/m, r = ставка/m, n = роки·m',
    input: { faceValue: 1_000, couponRate: 0.08, yearsToMaturity: 2, marketRate: 0.1, periodsPerYear: 2 },
    expected: 964.5404949583763,
    calculation: ['C = 40, r = 0,05, n = 4.', '40/1,05 + 40/1,05² + 40/1,05³ + 1 040/1,05⁴ = 38,0952 + 36,2812 + 34,5535 + 855,6106 = 964,54 грн.'],
  },
  currentYield: {
    id: 'current-yield',
    title: 'Поточна доходність облігації з попереднього прикладу',
    basis: 'Річний купон / ціна',
    input: { faceValue: 1_000, couponRate: 0.1, price: 951.9633746355682 },
    expected: 0.10504605814092598,
    calculation: ['100 / 951,96 = 0,10505 = 10,50%.'],
  },
  yieldToMaturity: {
    id: 'ytm-inverse',
    title: 'Доходність до погашення при ціні 951,96 — має вийти 12%',
    basis: 'Ставка r, за якої P(r) дорівнює ціні (ітеративно)',
    input: { price: 951.9633746355682, faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 3, periodsPerYear: 1 },
    expected: 0.12,
    calculation: ['P(12%) = 951,9634 (див. приклад облігації), отже YTM = 12%.'],
  },
  discount: {
    id: 'discount-security',
    title: 'Дисконтний папір: номінал 1 000, ціна 950, до погашення 182 дні',
    basis: 'Дисконтна ставка = (F − P)/F × 365/t; доходність інвестора = (F − P)/P × 365/t',
    input: { faceValue: 1_000, price: 950, daysToMaturity: 182, daysInYear: 365 },
    expected: { discountRate: 0.10027472527472528, investmentYield: 0.10555234239444765 },
    calculation: ['Дисконт 50.', '50 / 1 000 × 365 / 182 = 0,10027 = 10,03%.', '50 / 950 × 365 / 182 = 0,10555 = 10,56%.'],
  },
} as const;
