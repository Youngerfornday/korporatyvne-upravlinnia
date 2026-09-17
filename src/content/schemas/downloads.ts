import { z } from 'zod';
import { PracticalIdSchema } from './course-shared';
import { HttpUrlSchema, KebabIdSchema, ModuleIdSchema, NonEmptyTextSchema, TopicIdSchema, findDuplicates } from './primitives';

/**
 * Маніфест матеріалів для вивантаження: `public/downloads/manifest.json`.
 * Генерує конвеєр матеріалів перед збіркою сайту; читають кабінет викладача і сторінка «Як завантажити в Moodle».
 */
export const DownloadKindSchema = z.enum([
  'lecture',
  'slides',
  'practical',
  'syllabus',
  'work-program',
  'glossary',
  'question-bank',
  'book',
  'scorm',
  'backup',
  'bundle',
]);

export const DownloadFormatSchema = z.enum(['pdf', 'docx', 'pptx', 'xml', 'zip', 'mbz']);

/** Файл лежить у `public/downloads/` (шлях від base сайту) або, як резервна копія курсу, у GitHub Releases. */
export const DownloadItemSchema = z
  .object({
    id: KebabIdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema.optional(),
    kind: DownloadKindSchema,
    format: DownloadFormatSchema,
    audience: z.enum(['student', 'teacher']).default('student'),
    module: ModuleIdSchema.optional(),
    topic: TopicIdSchema.optional(),
    practical: PracticalIdSchema.optional(),
    path: z
      .string()
      .regex(/^downloads\/[a-z0-9_-]+(?:\.[a-z0-9_-]+)*(?:\/[a-z0-9_-]+(?:\.[a-z0-9_-]+)*)*$/, 'Шлях має починатися з downloads/ і не містити сегментів . або ..')
      .optional(),
    url: HttpUrlSchema.optional(),
    bytes: z.int().nonnegative(),
  })
  .refine((item) => (item.path === undefined) !== (item.url === undefined), {
    message: 'Матеріал має рівно одне з полів: path (файл сайту) або url (зовнішній файл)',
    path: ['path'],
  });

export const DownloadManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    items: z.array(DownloadItemSchema),
  })
  .superRefine((manifest, ctx) => {
    for (const id of findDuplicates(manifest.items.map((item) => item.id))) {
      ctx.addIssue({ code: 'custom', message: `Дублікат ID матеріалу «${id}»`, path: ['items'] });
    }
  });

export type DownloadKind = z.infer<typeof DownloadKindSchema>;
export type DownloadFormat = z.infer<typeof DownloadFormatSchema>;
export type DownloadItem = z.infer<typeof DownloadItemSchema>;
export type DownloadManifest = z.infer<typeof DownloadManifestSchema>;
