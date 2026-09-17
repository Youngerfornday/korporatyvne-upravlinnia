/**
 * Конструктор рішення: параметри стартапу → допустимі організаційно-правові форми і причини,
 * чому решта не підходять. Правила приходять з даних практичної, рушій лише зіставляє їх з профілем
 * і зводить у вердикт; жодної норми в коді немає — усі посилання беруться з `norm` правила.
 */
import { err, ok, type Result } from '../shared/result';
import type {
  FormCriterionDefinition,
  FormReason,
  FormRuleDefinition,
  FormStatus,
  FormVerdict,
  LegalFormDefinition,
  RuleEffect,
  StartupProfile,
} from './types';

export interface ChoiceError {
  readonly code: 'unknown-criterion' | 'unknown-option' | 'missing-answer';
  readonly criterion: string;
  readonly message: string;
}

export interface ChoiceDefinition {
  readonly forms: readonly LegalFormDefinition[];
  readonly criteria: readonly FormCriterionDefinition[];
  readonly rules: readonly FormRuleDefinition[];
}

const EFFECT_ORDER: Readonly<Record<RuleEffect, number>> = { blocks: 0, burden: 1, fits: 2 };

/** Профіль за замовчуванням — перший варіант кожного критерію: конструктор ніколи не стартує порожнім. */
export function defaultProfile(criteria: readonly FormCriterionDefinition[]): StartupProfile {
  return Object.fromEntries(criteria.flatMap((criterion) => (criterion.options[0] ? [[criterion.id, criterion.options[0].id]] : [])));
}

/** Перевірка профілю: відповідь є на кожен критерій і кожна відповідь — один з його варіантів. */
export function profileIssues(criteria: readonly FormCriterionDefinition[], profile: StartupProfile): readonly ChoiceError[] {
  const known = new Set(criteria.map((criterion) => criterion.id));
  const unknown = Object.keys(profile)
    .filter((id) => !known.has(id))
    .map((id): ChoiceError => ({ code: 'unknown-criterion', criterion: id, message: `Невідомий критерій «${id}».` }));
  const answers = criteria.flatMap((criterion): ChoiceError[] => {
    const chosen = profile[criterion.id];
    if (chosen === undefined || chosen === '') {
      return [{ code: 'missing-answer', criterion: criterion.id, message: `Дайте відповідь на питання «${criterion.question}».` }];
    }
    if (!criterion.options.some((option) => option.id === chosen)) {
      return [{ code: 'unknown-option', criterion: criterion.id, message: `Критерій «${criterion.title}»: невідомий варіант «${chosen}».` }];
    }
    return [];
  });
  return [...answers, ...unknown];
}

function statusOf(reasons: readonly FormReason[]): FormStatus {
  if (reasons.some((reason) => reason.effect === 'blocks')) return 'blocked';
  return reasons.some((reason) => reason.effect === 'burden') ? 'costly' : 'fits';
}

function reasonsFor(definition: ChoiceDefinition, profile: StartupProfile, formId: string): FormReason[] {
  const criterionById = new Map(definition.criteria.map((criterion) => [criterion.id, criterion]));
  const matched = definition.rules.flatMap((rule): FormReason[] => {
    if (rule.form !== formId || profile[rule.criterion] !== rule.option) return [];
    const criterion = criterionById.get(rule.criterion);
    const option = criterion?.options.find((candidate) => candidate.id === rule.option);
    if (!criterion || !option) return [];
    return [
      {
        criterion: rule.criterion,
        criterionTitle: criterion.title,
        option: rule.option,
        optionLabel: option.label,
        effect: rule.effect,
        reason: rule.reason,
        norm: rule.norm,
      },
    ];
  });
  return matched.sort((a, b) => EFFECT_ORDER[a.effect] - EFFECT_ORDER[b.effect]);
}

/** Вердикт по кожній формі в порядку визначення форм. Профіль має бути повним і коректним. */
export function evaluateForms(definition: ChoiceDefinition, profile: StartupProfile): Result<readonly FormVerdict[], readonly ChoiceError[]> {
  const issues = profileIssues(definition.criteria, profile);
  if (issues.length > 0) return err(issues);
  return ok(
    definition.forms.map((form) => {
      const reasons = reasonsFor(definition, profile, form.id);
      return { formId: form.id, status: statusOf(reasons), reasons };
    }),
  );
}

export interface ChoiceSummary {
  /** Форми без заборон і без ускладнень. */
  readonly fits: readonly string[];
  readonly costly: readonly string[];
  readonly blocked: readonly string[];
}

export function summarizeChoice(verdicts: readonly FormVerdict[]): ChoiceSummary {
  const of = (status: FormStatus) => verdicts.filter((verdict) => verdict.status === status).map((verdict) => verdict.formId);
  return { fits: of('fits'), costly: of('costly'), blocked: of('blocked') };
}

export const FORM_STATUS_LABELS: Readonly<Record<FormStatus, string>> = {
  fits: 'Підходить',
  costly: 'Можна, але дорожче',
  blocked: 'Не підходить',
};

/** Підсумок конструктора для aria-live: скільки форм лишилося і скільки відпало. */
export function choiceSummaryText(summary: ChoiceSummary, titleOf: (formId: string) => string): string {
  if (summary.fits.length === 0 && summary.costly.length === 0) return 'За цими параметрами не лишилося жодної форми — перегляньте відповіді.';
  const fits = summary.fits.length > 0 ? `Підходить: ${summary.fits.map(titleOf).join(', ')}.` : 'Форм без застережень немає.';
  const costly = summary.costly.length > 0 ? ` Можна, але дорожче: ${summary.costly.map(titleOf).join(', ')}.` : '';
  const blocked = summary.blocked.length > 0 ? ` Не підходить: ${summary.blocked.map(titleOf).join(', ')}.` : '';
  return `${fits}${costly}${blocked}`;
}
