import { describe, expect, it } from 'vitest';
import { generateDatasetItems } from '../../src/engines/quiz/index.ts';
import { datasetItems, datasetVariants, type CalculatedQuestion } from './dataset-items.ts';
import { examples, question } from './test-support/banks.ts';

/**
 * Головна вимога: значення в Moodle XML = значення рушія тесту (`generateDatasetItems`), інакше варіанти
 * задачі на сайті й у Moodle різні. Рушій імпортується тільки в тесті (під vitest), а не в експортері.
 */

function calculated(raw: unknown): CalculatedQuestion {
  const parsed = question(raw);
  if (parsed.type !== 'calculated') throw new Error('Очікувалося питання calculated');
  return parsed;
}

const VARIANTS = [
  calculated(examples.calculated()),
  calculated({
    ...examples.calculated(),
    id: 't07-q066',
    itemCount: 25,
    datasets: [
      { name: 'p', min: 1, max: 1000, decimals: 2, distribution: 'loguniform' },
      { name: 'r', min: -5.5, max: 5.5, decimals: 1 },
      { name: 'n', min: 3, max: 3, decimals: 0 },
    ],
  }),
];

describe('datasetVariants = generateDatasetItems рушія тесту', () => {
  it.each(VARIANTS.map((item) => [item.id, item] as const))('%s: ті самі числа й той самий порядок', (_id, question) => {
    expect(datasetVariants(question)).toEqual(generateDatasetItems(question));
  });

  it('рядки для XML відповідають числам варіантів із потрібною кількістю знаків', () => {
    const [question] = VARIANTS.slice(1) as [CalculatedQuestion];
    for (const dataset of question.datasets) {
      const items = datasetItems(question, dataset);
      expect(items).toHaveLength(question.itemCount);
      items.forEach((item, index) => {
        expect(Number(item)).toBe(generateDatasetItems(question)[index]?.[dataset.name]);
        expect(item.split('.')[1]?.length ?? 0).toBe(dataset.decimals);
      });
    }
  });

  it('набір стабільний між викликами і залежить від ID питання', () => {
    const [first] = VARIANTS as [CalculatedQuestion];
    expect(datasetVariants(first)).toEqual(datasetVariants(first));
    expect(datasetVariants(first)).not.toEqual(datasetVariants({ ...first, id: 't07-q916' }));
  });

  it('недодатні межі логарифмічного розподілу — зрозуміла помилка', () => {
    const bad = calculated({
      ...examples.calculated(),
      datasets: [...examples.calculated().datasets.slice(0, 2), { name: 'n', min: 0, max: 20, decimals: 0, distribution: 'loguniform' }],
    });
    const dataset = bad.datasets[2];
    expect(dataset).toBeDefined();
    expect(() => datasetItems(bad, dataset!)).toThrow(/логарифмічний розподіл потребує додатних min і max/);
  });
});
