import { z } from 'zod';
import { EssayTaskSchema } from './practical-essay';
import {
  CheckedAtSchema,
  HttpUrlSchema,
  IsoDateSchema,
  KebabIdSchema,
  NonEmptyTextSchema,
  findDuplicates,
  uniqueArray,
} from './primitives';

/**
 * Тренажер практичної 2 «Вибір форми бізнесу» (`kind: legal-form-choice`).
 * Конструктор рішення: критерії з варіантами → правила «форма × варіант» з наслідком і нормою.
 * Ряд ЄДРПОУ для задачі на динаміку, стартапи-кейси з готовим набором параметрів,
 * межі корпоративного договору і ризики стартапу під нього.
 *
 * Норми беруться лише з docs/research/legal-baseline.md: код рядка в дужках у полі `article`
 * (як у lawRef лекцій) перевіряє `npm run lint:content`.
 */

const MIN_FORMS = 3;
const MIN_CRITERIA = 4;
const MIN_RULES = 8;
const MIN_CASES = 3;
const MIN_RISKS = 5;
const MIN_POINTS = 3;
const MIN_OPTIONS = 2;

const BASELINE_CODE = /^[A-Z]{2,4}(?:-[A-Z]{2})?-\d{2}$/;

/** Норма з legal-baseline: код рядка, стаття, акт, пряме посилання й дата перевірки. */
export const PracticalNormSchema = z
  .object({
    id: KebabIdSchema,
    /** Код рядка бази: TOV-04, AT-14, GK-03. */
    code: z.string().regex(BASELINE_CODE, 'Код норми має вигляд TOV-04, AT-14, UBO-01'),
    /** Стаття з кодом у дужках — формат lawRef: «ст. 7 (TOV-04)». */
    article: NonEmptyTextSchema,
    /** Коротка назва акта для підпису: «Закон № 2275-VIII». */
    law: NonEmptyTextSchema,
    url: HttpUrlSchema,
    checkedAt: CheckedAtSchema,
    /** Що встановлює норма — власними словами. */
    summary: NonEmptyTextSchema,
  })
  .superRefine((norm, ctx) => {
    if (!norm.article.includes(`(${norm.code})`)) {
      ctx.addIssue({ code: 'custom', message: `Норма «${norm.id}»: стаття має містити код «(${norm.code})»`, path: ['article'] });
    }
  });

export const LegalFormSchema = z.object({
  id: KebabIdSchema,
  title: NonEmptyTextSchema,
  /** Коротка назва для чипів: ТОВ, ПрАТ. */
  short: NonEmptyTextSchema,
  /** ID терміна глосарію з реєстру course.yaml. */
  term: KebabIdSchema.optional(),
  summary: NonEmptyTextSchema,
  /** Норми, якими форма визначається (ID з розділу norms). */
  norms: uniqueArray(KebabIdSchema, 'Норми форми').min(1),
  /** Ключ ряду ЄДРПОУ, якщо форму видно в статистиці. */
  registryKey: KebabIdSchema.optional(),
});

export const FormCriterionOptionSchema = z.object({
  id: KebabIdSchema,
  label: NonEmptyTextSchema,
});

export const FormCriterionSchema = z
  .object({
    id: KebabIdSchema,
    title: NonEmptyTextSchema,
    question: NonEmptyTextSchema,
    options: z.array(FormCriterionOptionSchema).min(MIN_OPTIONS),
  })
  .superRefine((criterion, ctx) => {
    for (const id of findDuplicates(criterion.options.map((option) => option.id))) {
      ctx.addIssue({ code: 'custom', message: `Критерій «${criterion.id}»: дублікат варіанта «${id}»`, path: ['options'] });
    }
  });

/** Правило конструктора: що означає для форми конкретна відповідь на критерій. */
export const FormRuleSchema = z.object({
  form: KebabIdSchema,
  criterion: KebabIdSchema,
  option: KebabIdSchema,
  effect: z.enum(['blocks', 'burden', 'fits']),
  reason: NonEmptyTextSchema,
  norm: KebabIdSchema,
});

/** Стартап із завдання: опис, готовий набір параметрів для конструктора й очікувана форма. */
export const StartupCaseSchema = z.object({
  id: KebabIdSchema,
  title: NonEmptyTextSchema,
  description: NonEmptyTextSchema,
  /** ID критерію → ID варіанта. */
  preset: z.record(KebabIdSchema, KebabIdSchema),
  answer: KebabIdSchema,
  explanation: NonEmptyTextSchema,
  norm: KebabIdSchema,
});

export const RegistryFormSchema = z.object({
  key: KebabIdSchema,
  title: NonEmptyTextSchema,
  short: NonEmptyTextSchema,
});

export const RegistryPointSchema = z.object({
  date: IsoDateSchema,
  /** Покоління таблиці ЄДРПОУ: поділ на ПАТ/ПрАТ порівнюється лише в межах одного покоління. */
  generation: z.enum(['pre-2022', 'since-2022']),
  source: KebabIdSchema,
  values: z.record(KebabIdSchema, z.int().nonnegative()),
});

export const RegistrySeriesSchema = z
  .object({
    title: NonEmptyTextSchema,
    note: NonEmptyTextSchema,
    forms: z.array(RegistryFormSchema).min(2),
    points: z.array(RegistryPointSchema).min(MIN_POINTS),
  })
  .superRefine((series, ctx) => {
    for (const key of findDuplicates(series.forms.map((form) => form.key))) {
      ctx.addIssue({ code: 'custom', message: `Ряд ЄДРПОУ: дублікат форми «${key}»`, path: ['forms'] });
    }
    for (const date of findDuplicates(series.points.map((point) => point.date))) {
      ctx.addIssue({ code: 'custom', message: `Ряд ЄДРПОУ: дата ${date} трапляється двічі`, path: ['points'] });
    }
    const keys = series.forms.map((form) => form.key);
    series.points.forEach((point, index) => {
      for (const key of keys.filter((candidate) => point.values[candidate] === undefined)) {
        ctx.addIssue({ code: 'custom', message: `Ряд ЄДРПОУ, ${point.date}: немає числа для форми «${key}»`, path: ['points', index, 'values'] });
      }
    });
  });

/** Ризик стартапу, під який студент формулює умову корпоративного договору. */
export const AgreementRiskSchema = z.object({
  id: KebabIdSchema,
  risk: NonEmptyTextSchema,
  /** Що має врегулювати умова. */
  mustSettle: NonEmptyTextSchema,
  /** Наслідок, якщо умови немає. */
  consequence: NonEmptyTextSchema,
  norm: KebabIdSchema,
});

/** Межа закону для корпоративного договору: що дозволено і що робить умову нікчемною. */
export const AgreementLimitSchema = z.object({
  id: KebabIdSchema,
  title: NonEmptyTextSchema,
  text: NonEmptyTextSchema,
  norm: KebabIdSchema,
});

export const LegalFormChoiceSchema = z.object({
  kind: z.literal('legal-form-choice'),
  norms: z.array(PracticalNormSchema).min(1),
  forms: z.array(LegalFormSchema).min(MIN_FORMS),
  criteria: z.array(FormCriterionSchema).min(MIN_CRITERIA),
  rules: z.array(FormRuleSchema).min(MIN_RULES),
  cases: z.array(StartupCaseSchema).min(MIN_CASES),
  statistics: RegistrySeriesSchema,
  agreement: z.object({
    intro: NonEmptyTextSchema,
    limits: z.array(AgreementLimitSchema).min(2),
    risks: z.array(AgreementRiskSchema).min(MIN_RISKS),
  }),
  essay: EssayTaskSchema,
});

type LegalFormChoice = z.infer<typeof LegalFormChoiceSchema>;
type Issue = { message: string; path: PropertyKey[] };

function normRefIssues(trainer: LegalFormChoice): Issue[] {
  const norms = new Set(trainer.norms.map((norm) => norm.id));
  const missing = (id: string, path: PropertyKey[], where: string): Issue[] =>
    norms.has(id) ? [] : [{ message: `${where}: норму «${id}» не описано в розділі norms`, path }];
  return [
    ...trainer.forms.flatMap((form, index) => form.norms.flatMap((id) => missing(id, ['forms', index, 'norms'], `Форма «${form.id}»`))),
    ...trainer.rules.flatMap((rule, index) => missing(rule.norm, ['rules', index, 'norm'], `Правило «${rule.form} × ${rule.criterion}»`)),
    ...trainer.cases.flatMap((item, index) => missing(item.norm, ['cases', index, 'norm'], `Стартап «${item.id}»`)),
    ...trainer.agreement.limits.flatMap((limit, index) => missing(limit.norm, ['agreement', 'limits', index, 'norm'], `Межа «${limit.id}»`)),
    ...trainer.agreement.risks.flatMap((risk, index) => missing(risk.norm, ['agreement', 'risks', index, 'norm'], `Ризик «${risk.id}»`)),
  ];
}

function ruleIssues(trainer: LegalFormChoice): Issue[] {
  const forms = new Set(trainer.forms.map((form) => form.id));
  const options = new Map(trainer.criteria.map((criterion) => [criterion.id, new Set(criterion.options.map((option) => option.id))]));
  const seen = new Set<string>();
  return trainer.rules.flatMap((rule, index): Issue[] => {
    const key = `${rule.form}|${rule.criterion}|${rule.option}`;
    const duplicate = seen.has(key) ? [{ message: `Правило «${key}» описано двічі`, path: ['rules', index] }] : [];
    seen.add(key);
    const known = options.get(rule.criterion);
    return [
      ...duplicate,
      ...(forms.has(rule.form) ? [] : [{ message: `Правило ${index + 1}: невідома форма «${rule.form}»`, path: ['rules', index, 'form'] }]),
      ...(known ? [] : [{ message: `Правило ${index + 1}: невідомий критерій «${rule.criterion}»`, path: ['rules', index, 'criterion'] }]),
      ...(!known || known.has(rule.option) ? [] : [{ message: `Правило ${index + 1}: у критерії «${rule.criterion}» немає варіанта «${rule.option}»`, path: ['rules', index, 'option'] }]),
    ];
  });
}

function caseIssues(trainer: LegalFormChoice): Issue[] {
  const forms = new Set(trainer.forms.map((form) => form.id));
  const criteria = new Map(trainer.criteria.map((criterion) => [criterion.id, new Set(criterion.options.map((option) => option.id))]));
  return trainer.cases.flatMap((item, index): Issue[] => {
    const preset = Object.entries(item.preset);
    const answered = new Set(preset.map(([criterion]) => criterion));
    return [
      ...(forms.has(item.answer) ? [] : [{ message: `Стартап «${item.id}»: невідома форма «${item.answer}»`, path: ['cases', index, 'answer'] }]),
      ...preset.flatMap(([criterion, option]): Issue[] => {
        const known = criteria.get(criterion);
        if (!known) return [{ message: `Стартап «${item.id}»: невідомий критерій «${criterion}»`, path: ['cases', index, 'preset'] }];
        return known.has(option) ? [] : [{ message: `Стартап «${item.id}»: у критерії «${criterion}» немає варіанта «${option}»`, path: ['cases', index, 'preset'] }];
      }),
      ...[...criteria.keys()]
        .filter((criterion) => !answered.has(criterion))
        .map((criterion) => ({ message: `Стартап «${item.id}»: у наборі параметрів немає критерію «${criterion}»`, path: ['cases', index, 'preset'] })),
    ];
  });
}

/** Цілісність тренажера: унікальні ID, посилання на норми, форми, критерії й варіанти. */
export function legalFormIssues(trainer: LegalFormChoice): Issue[] {
  const duplicates = [
    ...findDuplicates(trainer.norms.map((norm) => norm.id)).map((id) => ({ message: `Дублікат ID норми «${id}»`, path: ['norms'] })),
    ...findDuplicates(trainer.forms.map((form) => form.id)).map((id) => ({ message: `Дублікат ID форми «${id}»`, path: ['forms'] })),
    ...findDuplicates(trainer.criteria.map((criterion) => criterion.id)).map((id) => ({ message: `Дублікат ID критерію «${id}»`, path: ['criteria'] })),
    ...findDuplicates(trainer.cases.map((item) => item.id)).map((id) => ({ message: `Дублікат ID стартапу «${id}»`, path: ['cases'] })),
    ...findDuplicates(trainer.agreement.risks.map((risk) => risk.id)).map((id) => ({ message: `Дублікат ID ризику «${id}»`, path: ['agreement', 'risks'] })),
  ];
  const registryKeys = new Set(trainer.statistics.forms.map((form) => form.key));
  const registryRefs = trainer.forms.flatMap((form, index): Issue[] =>
    form.registryKey === undefined || registryKeys.has(form.registryKey)
      ? []
      : [{ message: `Форма «${form.id}»: у ряді ЄДРПОУ немає ключа «${form.registryKey}»`, path: ['forms', index, 'registryKey'] }],
  );
  return [...duplicates, ...normRefIssues(trainer), ...ruleIssues(trainer), ...caseIssues(trainer), ...registryRefs];
}

/** Усі посилання на джерела ведуть на розділ sources файлу практичної. */
export function legalFormSourceIssues(trainer: LegalFormChoice, sourceIds: ReadonlySet<string>): Issue[] {
  return trainer.statistics.points.flatMap((point, index): Issue[] =>
    sourceIds.has(point.source) ? [] : [{ message: `Ряд ЄДРПОУ, ${point.date}: джерело «${point.source}» не описано`, path: ['statistics', 'points', index, 'source'] }],
  );
}

export type LegalFormTrainer = LegalFormChoice;
export type PracticalNorm = z.infer<typeof PracticalNormSchema>;
export type LegalFormEntry = z.infer<typeof LegalFormSchema>;
export type FormCriterion = z.infer<typeof FormCriterionSchema>;
export type FormRule = z.infer<typeof FormRuleSchema>;
export type StartupCase = z.infer<typeof StartupCaseSchema>;
export type RegistrySeries = z.infer<typeof RegistrySeriesSchema>;
export type AgreementRisk = z.infer<typeof AgreementRiskSchema>;
export type AgreementLimit = z.infer<typeof AgreementLimitSchema>;
