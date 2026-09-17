import { z } from 'zod';
import { KebabIdSchema, LawRefSchema, NonEmptyTextSchema, TopicIdSchema, findDuplicates } from './primitives';

/**
 * Презентація теми: `content/modules/mN/tNN/slides.yaml`.
 * З неї будуються PPTX у брендингу університету, веб-режим презентації на сайті і PDF.
 * Текст слайдів стислий: повний виклад — у лонгріді, розгорнуте пояснення — у нотатках доповідача.
 */

const MAX_BULLETS = 6;
const MAX_BULLET_LENGTH = 140;
const MAX_TITLE_LENGTH = 90;

const SlideTitleSchema = NonEmptyTextSchema.max(MAX_TITLE_LENGTH, `Заголовок слайда — до ${MAX_TITLE_LENGTH} символів`);
const BulletSchema = NonEmptyTextSchema.max(MAX_BULLET_LENGTH, `Пункт слайда — до ${MAX_BULLET_LENGTH} символів`);
const BulletsSchema = z.array(BulletSchema).min(1).max(MAX_BULLETS, `На слайді — до ${MAX_BULLETS} пунктів`);
/** Нотатки доповідача: що сказати, приклад, питання до аудиторії. */
const NotesSchema = NonEmptyTextSchema.optional();
/** ID джерела з sources.yaml теми. */
const SourceRefsSchema = z.array(KebabIdSchema).default([]);

const base = { id: KebabIdSchema, notes: NotesSchema, sources: SourceRefsSchema };

export const SlideSchema = z.discriminatedUnion('type', [
  /** Титульний слайд теми: назва й модуль беруться з реєстру. */
  z.object({ ...base, type: z.literal('title'), subtitle: NonEmptyTextSchema.optional() }),
  /** Розділ лекції. */
  z.object({ ...base, type: z.literal('section'), title: SlideTitleSchema, number: z.int().positive().optional() }),
  /** Результати навчання теми (коди ПРН з реєстру). */
  z.object({ ...base, type: z.literal('outcomes'), title: SlideTitleSchema }),
  z.object({ ...base, type: z.literal('bullets'), title: SlideTitleSchema, bullets: BulletsSchema }),
  z.object({
    ...base,
    type: z.literal('two-columns'),
    title: SlideTitleSchema,
    left: z.object({ heading: NonEmptyTextSchema, bullets: BulletsSchema }),
    right: z.object({ heading: NonEmptyTextSchema, bullets: BulletsSchema }),
  }),
  /** Схема з каталогу теми (SVG-файл лонгріда). */
  z.object({
    ...base,
    type: z.literal('figure'),
    title: SlideTitleSchema,
    figure: z.string().regex(/^fig-[a-z0-9-]+\.svg$/, 'Схема — файл fig-*.svg з каталогу теми'),
    caption: NonEmptyTextSchema,
  }),
  /** Норма права — лише з правової бази, з кодом рядка в lawRef. */
  z.object({ ...base, type: z.literal('norm'), title: SlideTitleSchema, text: NonEmptyTextSchema.max(400), lawRef: LawRefSchema }),
  z.object({ ...base, type: z.literal('formula'), title: SlideTitleSchema, formula: NonEmptyTextSchema, explanation: BulletsSchema }),
  /** Кейс з реєстру курсу: ключові факти й питання для обговорення. */
  z.object({
    ...base,
    type: z.literal('case'),
    title: SlideTitleSchema,
    case: KebabIdSchema,
    facts: BulletsSchema,
    question: NonEmptyTextSchema,
  }),
  z.object({ ...base, type: z.literal('quote'), text: NonEmptyTextSchema.max(300), attribution: NonEmptyTextSchema }),
  /** Питання до аудиторії або самоперевірка без балів. */
  z.object({ ...base, type: z.literal('question'), prompt: NonEmptyTextSchema, options: z.array(BulletSchema).max(4).default([]) }),
  z.object({ ...base, type: z.literal('summary'), title: SlideTitleSchema, bullets: BulletsSchema }),
]);

export const SlidesFileSchema = z
  .object({
    topic: TopicIdSchema,
    slides: z.array(SlideSchema).min(3),
  })
  .superRefine((file, ctx) => {
    for (const id of findDuplicates(file.slides.map((slide) => slide.id))) {
      ctx.addIssue({ code: 'custom', message: `Дублікат ID слайда «${id}»`, path: ['slides'] });
    }
    if (file.slides[0]?.type !== 'title') {
      ctx.addIssue({ code: 'custom', message: 'Перший слайд — титульний (type: title)', path: ['slides', 0] });
    }
  });

export type Slide = z.infer<typeof SlideSchema>;
export type SlidesFile = z.infer<typeof SlidesFileSchema>;
