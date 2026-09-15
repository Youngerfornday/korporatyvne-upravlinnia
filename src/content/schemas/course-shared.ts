import { z } from 'zod';
import { HttpUrlSchema, KebabIdSchema, NonEmptyTextSchema, findDuplicates } from './primitives';

/** Спільні елементи схеми course.yaml: ідентифікатори, посилання на дослідження й положення, рішення «звірити». */

export const PracticalIdSchema = z.string().regex(/^p\d{2}$/, 'ID практичної має вигляд p01, p02, …');
export const CompetenceIdSchema = z.string().regex(/^(?:zk|sk)\d{2}$/, 'ID компетентності має вигляд zk15 або sk01');

/** Документи docs/research/*.md, на розділи яких посилається course.yaml; існування розділів перевіряє тест. */
export const ResearchRefSchema = z.object({
  doc: z.enum(['education-standard', 'legal-baseline', 'data-sources', 'cases']),
  section: z.string().regex(/^\d+(?:\.\d+)?$/, 'Номер розділу документа, наприклад 2.4'),
});

/** Положення університету, на яке спираються оцінювання й політики. */
export const RegulationSchema = z.object({
  id: KebabIdSchema,
  title: NonEmptyTextSchema,
  approval: NonEmptyTextSchema,
  url: HttpUrlSchema,
  ref: ResearchRefSchema,
});

export const RegulationRefSchema = z.object({ regulation: KebabIdSchema, clause: NonEmptyTextSchema });

export const CONFIRMATION_NOTE_MESSAGE = 'Поле з needsConfirmation: true має пояснювати в note, що саме звірити';

/** Рішення «звірити з замовником» (needsConfirmation: true) обов’язково пояснює в note, що саме звірити. */
export function requiresNote(item: { needsConfirmation: boolean; note?: string | undefined }): boolean {
  return !item.needsConfirmation || item.note !== undefined;
}

/** Рішення за замовчуванням, яке має підтвердити замовник. */
export const ConfirmableSchema = z
  .object({
    value: NonEmptyTextSchema,
    needsConfirmation: z.boolean(),
    note: NonEmptyTextSchema.optional(),
  })
  .refine(requiresNote, { message: CONFIRMATION_NOTE_MESSAGE, path: ['note'] });

export type Report = (message: string, path: PropertyKey[]) => void;

export function reportDuplicates(values: readonly string[], label: string, path: PropertyKey[], report: Report): void {
  for (const duplicate of findDuplicates(values)) report(`Дублікат ${label} «${duplicate}» у реєстрі`, path);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Чи збігаються множини ID без урахування порядку й повторів. */
export function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Відсортований список ID без повторів для повідомлення про помилку. */
export function listIds(ids: readonly string[]): string {
  return `[${[...new Set(ids)].sort().join(', ')}]`;
}
