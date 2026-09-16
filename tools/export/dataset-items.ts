import { createSeededRandom } from '../../src/engines/shared/random.ts';
import type { QuestionOf } from './question-parts.ts';

/**
 * Значення наборів даних Moodle calculated. Moodle під час імпорту нічого не генерує, а бере значення
 * з файлу, тож варіанти на сайті й у Moodle збігаються лише тоді, коли експортер вивантажує той самий
 * набір, що й рушій тесту — `generateDatasetItems` (`src/engines/quiz/grading/numeric.ts`).
 *
 * Тут той самий алгоритм на тому ж `createSeededRandom` (зерно `calculated:<id>`, один виклик на змінну
 * в порядку `datasets`), а не імпорт рушія: `src/engines/quiz/index.ts` тягне `expression/evaluate.ts`
 * з властивістю-параметром конструктора, яку `node` у режимі стирання типів не приймає, а CLI експорту
 * має працювати без збірки. Збіг значень із рушієм закріплено тестом dataset-items.test.ts.
 */

export type CalculatedQuestion = QuestionOf<'calculated'>;
export type Dataset = CalculatedQuestion['datasets'][number];

function sample(dataset: Dataset, random: number): number {
  if (dataset.distribution === 'loguniform') {
    const logMin = Math.log(Math.abs(dataset.min));
    return Math.exp(logMin + (Math.log(Math.abs(dataset.max)) - logMin) * random);
  }
  return dataset.min + (dataset.max - dataset.min) * random;
}

/** Значення варіантів: по одному запису «змінна → число» на варіант, як у рушії тесту. */
export function datasetVariants(question: CalculatedQuestion): ReadonlyArray<Readonly<Record<string, number>>> {
  const random = createSeededRandom(`calculated:${question.id}`);
  return Array.from({ length: question.itemCount }, () =>
    Object.fromEntries(question.datasets.map((dataset) => [dataset.name, Number(sample(dataset, random.next()).toFixed(dataset.decimals))])),
  );
}

/** Значення однієї змінної для всіх варіантів рядками для XML (як `sprintf("%.{decimals}f")` у Moodle). */
export function datasetItems(question: CalculatedQuestion, dataset: Dataset): string[] {
  return datasetVariants(question).map((values) => formatDatasetValue(values[dataset.name], dataset));
}

function formatDatasetValue(value: number | undefined, dataset: Dataset): string {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Набір даних {${dataset.name}}: значення варіанта не є скінченним числом`);
  }
  const fixed = value.toFixed(dataset.decimals);
  return /^-0(?:\.0+)?$/.test(fixed) ? fixed.slice(1) : fixed;
}
