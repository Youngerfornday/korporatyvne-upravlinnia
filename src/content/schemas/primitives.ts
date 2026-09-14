import { z } from 'zod';

export const ModuleIdSchema = z.string().regex(/^m[1-9]\d*$/, 'ID модуля має вигляд m1, m2, …');
export const TopicIdSchema = z.string().regex(/^t\d{2}$/, 'ID теми має вигляд t01, t02, …');
export const LearningOutcomeIdSchema = z.string().regex(/^prn\d{2}$/, 'ID ПРН має вигляд prn01, prn02, …');

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const KebabIdSchema = z.string().max(80).regex(KEBAB_CASE, 'ID: латиниця в нижньому регістрі, цифри й дефіси');
export const SlugSchema = KebabIdSchema;

export const NonEmptyTextSchema = z.string().trim().min(1, 'Текст не може бути порожнім');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Дата `YYYY-MM-DD`. YAML-парсер Astro (js-yaml) перетворює незакавичені дати на Date,
 * пакет `yaml` лишає рядок — приймаємо обидва варіанти й нормалізуємо до рядка.
 */
export const IsoDateSchema = z.preprocess(
  (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : value),
  z.iso.date('Дата має формат РРРР-ММ-ДД'),
);

/** Дата перевірки джерела або норми не може бути в майбутньому (запас в один день — на часові пояси). */
export const CheckedAtSchema = IsoDateSchema.refine((date) => Date.parse(date) <= Date.now() + DAY_MS, {
  message: 'Дата перевірки не може бути в майбутньому',
});

export const HttpUrlSchema = z.url({ protocol: /^https?$/, error: 'Потрібна адреса http(s)' });

export const LawRefSchema = z.object({
  act: NonEmptyTextSchema,
  article: NonEmptyTextSchema,
  checkedAt: CheckedAtSchema,
  url: HttpUrlSchema.optional(),
});

/** Нормалізація для порівняння формулювань: регістр, пробіли, варіанти апострофа. */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[’'ʼ`]/g, '’').toLocaleLowerCase('uk-UA');
}

/** Значення, що трапляються більше одного разу, у порядку першої появи повтору. */
export function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function uniqueArray<T extends z.ZodType<string>>(item: T, label: string) {
  return z.array(item).refine((values) => findDuplicates(values).length === 0, {
    message: `${label}: значення не повинні повторюватися`,
  });
}
