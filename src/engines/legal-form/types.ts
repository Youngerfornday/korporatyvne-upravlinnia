/**
 * Типи тренажера «Вибір форми бізнесу». Визначення структурно збігаються з `content/practicals/p02.yaml`
 * → trainer (src/content/schemas/practical-legal-form.ts), але рушій від zod-схеми не залежить:
 * його можна зібрати в SCORM.
 */

/** Як параметр стартапу впливає на форму: закриває її, здорожчує або підтверджує вибір. */
export type RuleEffect = 'blocks' | 'burden' | 'fits';

export interface LegalFormDefinition {
  readonly id: string;
  readonly title: string;
  /** Коротка назва для чипів і вузьких екранів. */
  readonly short: string;
  readonly summary: string;
}

export interface FormCriterionOptionDefinition {
  readonly id: string;
  readonly label: string;
}

export interface FormCriterionDefinition {
  readonly id: string;
  readonly title: string;
  /** Питання, на яке відповідає студент у конструкторі. */
  readonly question: string;
  readonly options: readonly FormCriterionOptionDefinition[];
}

export interface FormRuleDefinition {
  readonly form: string;
  readonly criterion: string;
  readonly option: string;
  readonly effect: RuleEffect;
  /** Наслідок власними словами: чому саме так. */
  readonly reason: string;
  /** ID норми з розділу norms файлу практичної. */
  readonly norm: string;
}

/** Відповіді студента в конструкторі: ID критерію → ID варіанта. */
export type StartupProfile = Readonly<Record<string, string>>;

/** blocked — форму обрати не можна; costly — можна, але дорожче чи складніше; fits — підходить. */
export type FormStatus = 'fits' | 'costly' | 'blocked';

export interface FormReason {
  readonly criterion: string;
  readonly criterionTitle: string;
  readonly option: string;
  readonly optionLabel: string;
  readonly effect: RuleEffect;
  readonly reason: string;
  readonly norm: string;
}

export interface FormVerdict {
  readonly formId: string;
  readonly status: FormStatus;
  /** Спершу заборони, далі ускладнення, далі підтвердження. */
  readonly reasons: readonly FormReason[];
}

/** Покоління таблиці ЄДРПОУ: рядки різних поколінь не порівнюються за поділом ПАТ/ПрАТ. */
export type TableGeneration = 'pre-2022' | 'since-2022';

export interface RegistryFormDefinition {
  readonly key: string;
  readonly title: string;
  readonly short: string;
}

export interface RegistryPointDefinition {
  /** Дата «станом на» в ISO: 2020-01-01. */
  readonly date: string;
  readonly generation: TableGeneration;
  /** ID джерела зі списку sources практичної. */
  readonly source: string;
  /** Ключ форми → кількість зареєстрованих юридичних осіб. */
  readonly values: Readonly<Record<string, number>>;
}

export interface RegistrySeriesDefinition {
  readonly forms: readonly RegistryFormDefinition[];
  readonly points: readonly RegistryPointDefinition[];
}
