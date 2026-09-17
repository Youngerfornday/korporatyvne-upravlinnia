import { err, ok, type Result } from '../shared/result';
import type { CompanyTaskDefinition, MatrixDefinition } from './types';

/**
 * Завдання «визнач модель компанії»: студент обирає модель і рівно дві ознаки, які її видають.
 * right — модель правильна й обидві ознаки ключові; partial — модель правильна, але ознаки не ті;
 * wrong — модель хибна. Розбір показує ключові ознаки з формулюванням клітинки правильної моделі.
 */
export const REQUIRED_KEY_FEATURES = 2;

export interface CompanyResponse {
  readonly model: string | null;
  readonly features: readonly string[];
}

export type CompanyErrorCode = 'no-model' | 'unknown-model' | 'feature-count' | 'unknown-feature';

export interface CompanyError {
  readonly code: CompanyErrorCode;
  readonly message: string;
}

export const COMPANY_ERROR_MESSAGES: Readonly<Record<CompanyErrorCode, string>> = {
  'no-model': 'Оберіть модель, до якої належить компанія.',
  'unknown-model': 'Такої моделі в матриці немає.',
  'feature-count': `Позначте рівно ${REQUIRED_KEY_FEATURES} ознаки, які видають модель.`,
  'unknown-feature': 'Такої ознаки в матриці немає.',
};

export interface CompanyKeyFeature {
  readonly featureId: string;
  readonly title: string;
  /** Формулювання клітинки цієї ознаки для правильної моделі. */
  readonly statement: string;
  readonly chosen: boolean;
}

export interface CompanyGrade {
  readonly taskId: string;
  readonly state: 'right' | 'partial' | 'wrong';
  readonly modelCorrect: boolean;
  readonly chosenModel: string;
  readonly correctModel: string;
  readonly keyChosen: readonly string[];
  readonly otherChosen: readonly string[];
  readonly keyFeatures: readonly CompanyKeyFeature[];
  readonly explanation: string;
  readonly source: string;
}

function fail(code: CompanyErrorCode): { readonly ok: false; readonly error: CompanyError } {
  return err({ code, message: COMPANY_ERROR_MESSAGES[code] });
}

function keyFeaturesOf(task: CompanyTaskDefinition, matrix: MatrixDefinition, chosen: readonly string[]): CompanyKeyFeature[] {
  if (!matrix.models.some((model) => model.id === task.answer)) throw new Error(`Завдання «${task.id}»: невідома модель «${task.answer}»`);
  return task.keyFeatures.map((featureId) => {
    const feature = matrix.features.find((candidate) => candidate.id === featureId);
    const cell = feature?.cells.find((candidate) => candidate.model === task.answer);
    if (!feature || !cell) throw new Error(`Завдання «${task.id}»: невідома ознака «${featureId}»`);
    return { featureId, title: feature.title, statement: cell.statement, chosen: chosen.includes(featureId) };
  });
}

export function gradeCompanyTask(task: CompanyTaskDefinition, matrix: MatrixDefinition, response: CompanyResponse): Result<CompanyGrade, CompanyError> {
  const keyFeatures = keyFeaturesOf(task, matrix, response.features);
  if (response.model === null) return fail('no-model');
  if (!matrix.models.some((model) => model.id === response.model)) return fail('unknown-model');
  const unique = [...new Set(response.features)];
  if (unique.length !== REQUIRED_KEY_FEATURES || unique.length !== response.features.length) return fail('feature-count');
  if (unique.some((featureId) => !matrix.features.some((feature) => feature.id === featureId))) return fail('unknown-feature');

  const keyChosen = unique.filter((featureId) => task.keyFeatures.includes(featureId));
  const otherChosen = unique.filter((featureId) => !task.keyFeatures.includes(featureId));
  const modelCorrect = response.model === task.answer;
  const state = !modelCorrect ? 'wrong' : keyChosen.length >= REQUIRED_KEY_FEATURES ? 'right' : 'partial';
  return ok({
    taskId: task.id,
    state,
    modelCorrect,
    chosenModel: response.model,
    correctModel: task.answer,
    keyChosen,
    otherChosen,
    keyFeatures,
    explanation: task.explanation,
    source: task.source,
  });
}
