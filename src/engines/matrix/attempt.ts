import { createSeededRandom, shuffled } from '../shared/random';
import { err, ok, type Result } from '../shared/result';
import { MATRIX_ERROR_MESSAGES } from './texts';
import type {
  MatrixAttempt,
  MatrixCellDefinition,
  MatrixDefinition,
  MatrixError,
  MatrixErrorCode,
  MatrixFeatureDefinition,
  MatrixItemReview,
  MatrixMode,
  MatrixProgress,
  MatrixSummary,
} from './types';

export type { MatrixAttempt } from './types';

/**
 * Спроба тренажера-матриці: студент зіставляє формулювання клітинок з моделями.
 * - learning: ознака перевіряється цілою («Перевірити»), після чого відповіді фіксуються і відкривається
 *   розбір кожної клітинки з джерелом; завершити можна лише після перевірки всіх ознак.
 * - graded: відповіді можна змінювати до завершення; розбір і лічильники правильних — лише після завершення,
 *   пропуски рахуються як неправильні.
 */

const ITEM_SEPARATOR = ':';

export function itemIdOf(featureId: string, modelId: string): string {
  return `${featureId}${ITEM_SEPARATOR}${modelId}`;
}

type MatrixResult = Result<MatrixAttempt, MatrixError>;

function fail(code: MatrixErrorCode): { readonly ok: false; readonly error: MatrixError } {
  return err({ code, message: MATRIX_ERROR_MESSAGES[code] });
}

/** Помилки програміста в даних: контент уже валідує zod, тут — захист для SCORM і тестів. */
function assertValidMatrix(matrix: MatrixDefinition): void {
  if (matrix.models.length < 2) throw new Error('Матриця має містити щонайменше дві моделі');
  const modelIds = new Set(matrix.models.map((model) => model.id));
  const featureIds = new Set<string>();
  for (const feature of matrix.features) {
    if (featureIds.has(feature.id)) throw new Error(`Дублікат ознаки «${feature.id}»`);
    featureIds.add(feature.id);
    const described = new Set<string>();
    for (const cell of feature.cells) {
      if (!modelIds.has(cell.model)) throw new Error(`Ознака «${feature.id}»: невідома модель «${cell.model}»`);
      if (described.has(cell.model)) throw new Error(`Ознака «${feature.id}»: модель «${cell.model}» описана двічі`);
      described.add(cell.model);
    }
  }
  if (featureIds.size === 0) throw new Error('Матриця має містити щонайменше одну ознаку');
}

export interface StartMatrixAttemptInput {
  readonly matrix: MatrixDefinition;
  readonly mode: MatrixMode;
  /** Зерно перемішування: однакове зерно — однаковий порядок ознак і формулювань. */
  readonly seed: string;
  readonly now: Date;
}

export function startMatrixAttempt({ matrix, mode, seed, now }: StartMatrixAttemptInput): MatrixAttempt {
  assertValidMatrix(matrix);
  const random = createSeededRandom(seed);
  const groups = shuffled(matrix.features, random).map((feature) => ({
    featureId: feature.id,
    itemIds: shuffled(feature.cells, random).map((cell) => itemIdOf(feature.id, cell.model)),
  }));
  return { mode, seed, status: 'running', groups, responses: {}, checkedFeatures: [], startedAt: now.toISOString(), finishedAt: null };
}

interface LocatedItem {
  readonly feature: MatrixFeatureDefinition;
  readonly cell: MatrixCellDefinition;
}

function locateItem(attempt: MatrixAttempt, matrix: MatrixDefinition, itemId: string): LocatedItem | null {
  const separator = itemId.indexOf(ITEM_SEPARATOR);
  if (separator <= 0) return null;
  const featureId = itemId.slice(0, separator);
  const modelId = itemId.slice(separator + 1);
  const inAttempt = attempt.groups.some((group) => group.featureId === featureId && group.itemIds.includes(itemId));
  if (!inAttempt) return null;
  const feature = matrix.features.find((candidate) => candidate.id === featureId);
  const cell = feature?.cells.find((candidate) => candidate.model === modelId);
  return feature && cell ? { feature, cell } : null;
}

function responseOf(attempt: MatrixAttempt, itemId: string): string | null {
  return Object.hasOwn(attempt.responses, itemId) ? (attempt.responses[itemId] ?? null) : null;
}

/** Обрати модель для формулювання (null — зняти вибір). */
export function selectModel(attempt: MatrixAttempt, matrix: MatrixDefinition, itemId: string, modelId: string | null): MatrixResult {
  if (attempt.status === 'finished') return fail('finished');
  const located = locateItem(attempt, matrix, itemId);
  if (!located) return fail('unknown-item');
  if (modelId !== null && !matrix.models.some((model) => model.id === modelId)) return fail('unknown-model');
  if (attempt.checkedFeatures.includes(located.feature.id)) return fail('locked');

  const responses = Object.fromEntries(Object.entries(attempt.responses).filter(([key]) => key !== itemId));
  return ok({ ...attempt, responses: modelId === null ? responses : { ...responses, [itemId]: modelId } });
}

/** Навчальна спроба: перевірити ознаку цілком — зафіксувати відповіді й відкрити розбір. */
export function checkFeature(attempt: MatrixAttempt, matrix: MatrixDefinition, featureId: string): MatrixResult {
  if (attempt.status === 'finished') return fail('finished');
  if (attempt.mode !== 'learning') return fail('not-learning');
  const group = attempt.groups.find((candidate) => candidate.featureId === featureId);
  if (!group || !matrix.features.some((feature) => feature.id === featureId)) return fail('unknown-feature');
  if (attempt.checkedFeatures.includes(featureId)) return fail('already-checked');
  if (group.itemIds.some((itemId) => responseOf(attempt, itemId) === null)) return fail('incomplete');
  return ok({ ...attempt, checkedFeatures: [...attempt.checkedFeatures, featureId] });
}

export function finishMatrixAttempt(attempt: MatrixAttempt, _matrix: MatrixDefinition, now: Date): MatrixResult {
  if (attempt.status === 'finished') return fail('finished');
  if (attempt.mode === 'learning' && attempt.checkedFeatures.length < attempt.groups.length) return fail('incomplete');
  return ok({ ...attempt, status: 'finished', finishedAt: now.toISOString() });
}

function isRevealed(attempt: MatrixAttempt, featureId: string): boolean {
  return attempt.status === 'finished' || (attempt.mode === 'learning' && attempt.checkedFeatures.includes(featureId));
}

/** Розбір формулювання. До розкриття правильна модель і пояснення не повертаються. */
export function reviewItem(attempt: MatrixAttempt, matrix: MatrixDefinition, itemId: string): MatrixItemReview {
  const located = locateItem(attempt, matrix, itemId);
  if (!located) throw new Error(`Невідоме формулювання «${itemId}»`);
  const { feature, cell } = located;
  const chosenModel = responseOf(attempt, itemId);
  const base = { itemId, featureId: feature.id, featureTitle: feature.title, statement: cell.statement, chosenModel };
  if (!isRevealed(attempt, feature.id)) {
    return { ...base, state: chosenModel === null ? 'unanswered' : 'answered', revealed: false };
  }
  const state = chosenModel === null ? 'unanswered' : chosenModel === cell.model ? 'right' : 'wrong';
  return {
    ...base,
    state,
    revealed: true,
    correctModel: cell.model,
    explanation: cell.explanation,
    sources: [cell.source, ...(cell.alsoSources ?? [])],
  };
}

function isRight(attempt: MatrixAttempt, itemId: string): boolean {
  const modelId = itemId.slice(itemId.indexOf(ITEM_SEPARATOR) + 1);
  return responseOf(attempt, itemId) === modelId;
}

/** Підсумок завершеної спроби. Для незавершеної — помилка програміста (UI не має підглядати відповіді). */
export function summarizeMatrixAttempt(attempt: MatrixAttempt, matrix: MatrixDefinition): MatrixSummary {
  if (attempt.status !== 'finished') throw new Error('Підсумок доступний лише для завершеної спроби');
  const itemIds = attempt.groups.flatMap((group) => group.itemIds);
  const answered = itemIds.filter((itemId) => responseOf(attempt, itemId) !== null).length;
  const right = itemIds.filter((itemId) => isRight(attempt, itemId)).length;
  const total = itemIds.length;
  return {
    total,
    answered,
    right,
    wrong: answered - right,
    unanswered: total - answered,
    share: total > 0 ? right / total : 0,
    features: matrix.features.map((feature) => {
      const ids = feature.cells.map((cell) => itemIdOf(feature.id, cell.model));
      return { featureId: feature.id, right: ids.filter((itemId) => isRight(attempt, itemId)).length, total: ids.length };
    }),
    models: matrix.models.map((model) => {
      const ids = matrix.features.filter((feature) => feature.cells.some((cell) => cell.model === model.id)).map((feature) => itemIdOf(feature.id, model.id));
      return { modelId: model.id, right: ids.filter((itemId) => isRight(attempt, itemId)).length, total: ids.length };
    }),
  };
}

/** Лічильники для навігатора й aria-live; правильні рахуються лише серед уже розкритих формулювань. */
export function attemptProgress(attempt: MatrixAttempt, _matrix: MatrixDefinition): MatrixProgress {
  const itemIds = attempt.groups.flatMap((group) => group.itemIds);
  const revealedIds = attempt.groups.filter((group) => isRevealed(attempt, group.featureId)).flatMap((group) => group.itemIds);
  return {
    total: itemIds.length,
    answered: itemIds.filter((itemId) => responseOf(attempt, itemId) !== null).length,
    revealed: revealedIds.length,
    revealedRight: revealedIds.filter((itemId) => isRight(attempt, itemId)).length,
    checkedFeatures: attempt.checkedFeatures.length,
    features: attempt.groups.length,
  };
}
