/**
 * Типи тренажера-матриці. Визначення структурно збігаються з `content/practicals/pNN.yaml` → trainer
 * (src/content/schemas/practical.ts), але рушій від zod-схеми не залежить: його можна зібрати в SCORM.
 */

export interface MatrixModelDefinition {
  readonly id: string;
  readonly title: string;
  readonly short: string;
}

export interface MatrixCellDefinition {
  readonly model: string;
  readonly statement: string;
  readonly explanation: string;
  readonly source: string;
  readonly alsoSources?: readonly string[];
}

export interface MatrixFeatureDefinition {
  readonly id: string;
  readonly title: string;
  readonly cells: readonly MatrixCellDefinition[];
}

export interface MatrixDefinition {
  readonly models: readonly MatrixModelDefinition[];
  readonly features: readonly MatrixFeatureDefinition[];
}

export interface CompanyTaskDefinition {
  readonly id: string;
  readonly company: string;
  readonly description: string;
  readonly answer: string;
  readonly keyFeatures: readonly string[];
  readonly explanation: string;
  readonly source: string;
}

/** learning — перша, навчальна спроба з розбором після кожної ознаки; graded — друга, оцінювана за рубрикою. */
export type MatrixMode = 'learning' | 'graded';

/** Ознака в порядку показу: формулювання (клітинки) перемішані. */
export interface MatrixGroup {
  readonly featureId: string;
  readonly itemIds: readonly string[];
}

/** Незмінний серіалізовний стан спроби. */
export interface MatrixAttempt {
  readonly mode: MatrixMode;
  readonly seed: string;
  readonly status: 'running' | 'finished';
  readonly groups: readonly MatrixGroup[];
  /** ID формулювання → ID обраної моделі. */
  readonly responses: Readonly<Record<string, string>>;
  /** Навчальна спроба: ознаки, розбір яких уже відкрито (відповіді зафіксовано). */
  readonly checkedFeatures: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

export type MatrixErrorCode =
  | 'finished'
  | 'unknown-item'
  | 'unknown-model'
  | 'unknown-feature'
  | 'locked'
  | 'not-learning'
  | 'already-checked'
  | 'incomplete'
  | 'learning-unfinished'
  | 'graded-started';

export interface MatrixError {
  readonly code: MatrixErrorCode;
  readonly message: string;
}

/** Стан формулювання: до розкриття — лише «обрано / не обрано», після — «правильно / неправильно / без відповіді». */
export type MatrixItemState = 'answered' | 'unanswered' | 'right' | 'wrong';

export interface MatrixItemReview {
  readonly itemId: string;
  readonly featureId: string;
  readonly featureTitle: string;
  readonly statement: string;
  readonly chosenModel: string | null;
  readonly state: MatrixItemState;
  readonly revealed: boolean;
  /** Лише після розкриття. */
  readonly correctModel?: string;
  readonly explanation?: string;
  /** Основне джерело першим, далі додаткові. */
  readonly sources?: readonly string[];
}

export interface MatrixSummary {
  readonly total: number;
  readonly answered: number;
  readonly right: number;
  readonly wrong: number;
  readonly unanswered: number;
  /** Частка правильних 0..1 — результат для `trainer-completed`. */
  readonly share: number;
  /** У порядку ознак визначення. */
  readonly features: readonly { readonly featureId: string; readonly right: number; readonly total: number }[];
  readonly models: readonly { readonly modelId: string; readonly right: number; readonly total: number }[];
}

export interface MatrixProgress {
  readonly total: number;
  readonly answered: number;
  /** Скільки формулювань уже розкрито (навчальна спроба). */
  readonly revealed: number;
  readonly revealedRight: number;
  readonly checkedFeatures: number;
  readonly features: number;
}
