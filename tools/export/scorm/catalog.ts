import { CALCULATOR_TRAINERS, practicalLabel, type CalculatorKey } from '../../../src/components/trainers/catalog.ts';
import type { Course } from '../../../src/content/schemas/course.ts';
import { matrixTrainerOf, type PracticalFile } from '../../../src/content/schemas/practical.ts';
import { rubricBandsFromLevels, matrixActivityId, type RubricBand } from '../../../src/engines/matrix/index.ts';
import { typo } from '../../../src/lib/typography/index.ts';
import type { ScormPackageData, ScormPackageKind } from './app/data.ts';

/**
 * Які пакети SCORM збираються і з якими даними: тренажер-матриця кожної практичної з файлом тренажера
 * (дані й рубрика — як на сторінці практичної) і три тренажери-калькулятори з каталогу сайту.
 * Прохідний бал (`adlcp:masteryscore`): для матриці — нижня межа найвищого рівня рубрики («не менше 90%»);
 * калькулятор зараховує лише повністю правильно розв’язаний варіант, тому поріг — 100.
 */

export const CALCULATOR_MASTERY_PERCENT = 100;

export interface ScormPackageSpec {
  /** Стабільний ідентифікатор пакета: основа назви ZIP та ідентифікаторів маніфесту. */
  readonly id: string;
  readonly kind: ScormPackageKind;
  readonly registryId: string;
  readonly practicalId: string;
  readonly module: string;
  readonly title: string;
  /** Рядок над заголовком: курс і практична. */
  readonly kicker: string;
  readonly lede: string;
  readonly facts: readonly string[];
  readonly masteryPercent: number;
  readonly data: ScormPackageData;
}

type Practical = Course['practicals'][number];

const CALCULATOR_KINDS: Readonly<Record<CalculatorKey, Exclude<ScormPackageKind, 'matrix'>>> = {
  quorum: 'quorum',
  cumulative: 'cumulative',
  dividends: 'dividends',
};

function registryPractical(course: Course, practicalId: string): Practical {
  const practical = course.practicals.find((candidate) => candidate.id === practicalId);
  if (!practical) throw new Error(`Практичної ${practicalId} немає в реєстрі course.yaml`);
  return practical;
}

/** Критерій рубрики для матриці — той самий вибір, що на сторінці практичної: назва з «матриц», інакше перший з порогами. */
export function matrixCriterion(practical: Practical): { readonly title: string; readonly bands: readonly RubricBand[] } {
  const ordered = [...practical.rubric].sort((a, b) => Number(/матриц/i.test(b.title)) - Number(/матриц/i.test(a.title)));
  for (const criterion of ordered) {
    const bands = rubricBandsFromLevels(criterion.levels);
    if (bands.ok) return { title: criterion.title, bands: bands.value };
  }
  throw new Error(`Практична ${practical.id}: у рубриці немає критерію з порогами у відсотках для матриці`);
}

function kickerOf(course: Course, practical: Practical): string {
  return typo(`${course.title} · ${practicalLabel(practical.id)}. ${practical.title}`);
}

function matrixSpec(course: Course, file: PracticalFile): ScormPackageSpec {
  const practical = registryPractical(course, file.id);
  const trainer = matrixTrainerOf(file);
  const rubric = matrixCriterion(practical);
  const masteryPercent = rubric.bands[0]?.minPercent ?? CALCULATOR_MASTERY_PERCENT;
  const cells = trainer.features.reduce((total, feature) => total + feature.cells.length, 0);
  const data: ScormPackageData = {
    kind: 'matrix',
    activityId: matrixActivityId(practical.id),
    masteryPercent,
    practicalId: practical.id,
    matrix: {
      models: trainer.models.map((model) => ({ id: model.id, title: typo(model.title), short: typo(model.short) })),
      features: trainer.features.map((feature) => ({
        id: feature.id,
        title: typo(feature.title),
        cells: feature.cells.map((cell) => ({ model: cell.model, statement: typo(cell.statement), explanation: typo(cell.explanation), source: cell.source, alsoSources: cell.alsoSources })),
      })),
    },
    sources: Object.fromEntries(file.sources.map((source) => [source.id, { title: typo(source.title), url: source.url, checkedAt: source.checkedAt }])),
    rubric,
    companyTasks: trainer.companyTasks.map((task) => ({ ...task, company: typo(task.company), description: typo(task.description), explanation: typo(task.explanation) })),
  };
  return {
    id: `${practical.id}-matrytsia-modelei`,
    kind: 'matrix',
    registryId: 'model-matrix',
    practicalId: practical.id,
    module: practical.module,
    title: typo(`${practicalLabel(practical.id)}. ${practical.title}`),
    kicker: kickerOf(course, practical),
    lede: typo(practical.goal),
    facts: [
      typo(`${trainer.features.length} ознак × ${trainer.models.length} моделі = ${cells} формулювань`),
      typo(`Перша спроба навчальна, оцінюється друга: бал за критерієм «${rubric.title}»`),
      typo(`Зараховано з ${masteryPercent} балів зі 100`),
    ],
    masteryPercent,
    data,
  };
}

function calculatorSpecs(course: Course): ScormPackageSpec[] {
  return CALCULATOR_TRAINERS.map((trainer) => {
    const practical = registryPractical(course, trainer.practicalId);
    const kind = CALCULATOR_KINDS[trainer.key];
    return {
      id: `${practical.id}-${trainer.slug}`,
      kind,
      registryId: trainer.registryId,
      practicalId: practical.id,
      module: practical.module,
      title: typo(`${practicalLabel(practical.id)}. Тренажер «${trainer.title}»`),
      kicker: kickerOf(course, practical),
      lede: typo(trainer.text),
      facts: [typo(trainer.formula), typo('Зараховано, коли варіант задачі розв’язано повністю правильно (100 балів)')],
      masteryPercent: CALCULATOR_MASTERY_PERCENT,
      data: { kind, activityId: trainer.activityId, masteryPercent: CALCULATOR_MASTERY_PERCENT },
    };
  });
}

/** Пакети в порядку практичних; матриці — лише для практичних із файлом тренажера. */
export function scormPackageSpecs(course: Course, practicals: readonly PracticalFile[]): ScormPackageSpec[] {
  const order = (spec: ScormPackageSpec): number => course.practicals.findIndex((practical) => practical.id === spec.practicalId);
  const specs = [...practicals.filter((file) => file.trainer.kind === 'model-matrix').map((file) => matrixSpec(course, file)), ...calculatorSpecs(course)];
  return specs.sort((a, b) => order(a) - order(b));
}
