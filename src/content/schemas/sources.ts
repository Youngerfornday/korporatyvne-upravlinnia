import { z } from 'zod';
import { CheckedAtSchema, HttpUrlSchema, KebabIdSchema, NonEmptyTextSchema, TopicIdSchema, findDuplicates } from './primitives';

export const SourceSchema = z.object({
  id: KebabIdSchema,
  type: z.enum(['law', 'regulation', 'standard', 'book', 'article', 'report', 'dataset', 'case', 'web']),
  title: NonEmptyTextSchema,
  authors: z.array(NonEmptyTextSchema).default([]),
  publisher: NonEmptyTextSchema.optional(),
  year: z.int().min(1900).max(2100).optional(),
  language: z.enum(['uk', 'en', 'de', 'fr', 'other']).default('uk'),
  url: HttpUrlSchema,
  checkedAt: CheckedAtSchema,
  note: NonEmptyTextSchema.optional(),
});

/** Файл `content/modules/mN/tNN/sources.yaml`. Кожне джерело — з URL і датою перевірки. */
export const SourcesFileSchema = z
  .object({
    topic: TopicIdSchema,
    sources: z.array(SourceSchema).min(1),
  })
  .superRefine((file, ctx) => {
    for (const id of findDuplicates(file.sources.map((s) => s.id))) {
      ctx.addIssue({ code: 'custom', message: `Дублікат ID джерела «${id}»`, path: ['sources'] });
    }
  });

export type Source = z.infer<typeof SourceSchema>;
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
