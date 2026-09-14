import { z } from 'zod';
import { KebabIdSchema, NonEmptyTextSchema, TopicIdSchema, findDuplicates, normalizeText, uniqueArray } from './primitives';

export const GlossaryTermSchema = z
  .object({
    id: KebabIdSchema,
    term: NonEmptyTextSchema,
    definition: NonEmptyTextSchema,
    synonyms: z.array(NonEmptyTextSchema).default([]),
    /** Словоформи для пошуку й підказок (Pagefind, Popover). */
    forms: z.array(NonEmptyTextSchema).default([]),
    seeAlso: uniqueArray(KebabIdSchema, 'Пов’язані терміни').default([]),
  })
  .refine((term) => !term.seeAlso.includes(term.id), { message: 'Термін не може посилатися сам на себе', path: ['seeAlso'] });

/** Файл `content/modules/mN/tNN/glossary.yaml`. */
export const GlossaryFileSchema = z
  .object({
    topic: TopicIdSchema,
    terms: z.array(GlossaryTermSchema),
  })
  .superRefine((file, ctx) => {
    for (const id of findDuplicates(file.terms.map((t) => t.id))) {
      ctx.addIssue({ code: 'custom', message: `Дублікат ID терміна «${id}»`, path: ['terms'] });
    }
    for (const label of findDuplicates(file.terms.map((t) => normalizeText(t.term)))) {
      ctx.addIssue({ code: 'custom', message: `Термін «${label}» визначено двічі`, path: ['terms'] });
    }
  });

export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type GlossaryFile = z.infer<typeof GlossaryFileSchema>;
