import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { checkBanks, checkGlossaries, checkSources, checkTopics } from './content/integrity/checks';
import { withIntegrityCheck } from './content/integrity/loader';
import { CourseSchema } from './content/schemas/course';
import { GlossaryFileSchema } from './content/schemas/glossary';
import { PracticalFileSchema } from './content/schemas/practical';
import { BankFileSchema } from './content/schemas/questions';
import { SlidesFileSchema } from './content/schemas/slides';
import { SourcesFileSchema } from './content/schemas/sources';
import { TopicFrontmatterSchema } from './content/schemas/topic';

/** Єдине джерело правди — каталог content/ у корені репозиторію. */
const CONTENT_ROOT = './content';
const MODULES_ROOT = `${CONTENT_ROOT}/modules`;

const course = defineCollection({
  loader: glob({ base: CONTENT_ROOT, pattern: 'course.yaml' }),
  schema: CourseSchema,
});

const topics = defineCollection({
  loader: withIntegrityCheck(glob({ base: MODULES_ROOT, pattern: 'm*/t*/lecture.mdx' }), checkTopics),
  schema: TopicFrontmatterSchema,
});

const glossary = defineCollection({
  loader: withIntegrityCheck(glob({ base: MODULES_ROOT, pattern: 'm*/t*/glossary.yaml' }), checkGlossaries),
  schema: GlossaryFileSchema,
});

const sources = defineCollection({
  loader: withIntegrityCheck(glob({ base: MODULES_ROOT, pattern: 'm*/t*/sources.yaml' }), checkSources),
  schema: SourcesFileSchema,
});

/** Лише тренувальні банки: контрольні живуть у приватному репозиторії. */
const trainingBanks = defineCollection({
  loader: withIntegrityCheck(glob({ base: `${CONTENT_ROOT}/banks/training`, pattern: '*.yaml' }), checkBanks),
  schema: BankFileSchema,
});

/** Дані тренажерів практичних: `content/practicals/pNN.yaml`; реєстр практичних — у course.yaml. */
const practicals = defineCollection({
  loader: glob({ base: `${CONTENT_ROOT}/practicals`, pattern: 'p*.yaml' }),
  schema: PracticalFileSchema,
});

/** Презентації тем: `content/modules/mN/tNN/slides.yaml` — веб-режим `temy/<slug>/prezentatsiia/`, PDF і PPTX. */
const slides = defineCollection({
  loader: glob({ base: MODULES_ROOT, pattern: 'm*/t*/slides.yaml' }),
  schema: SlidesFileSchema,
});

export const collections = { course, topics, glossary, sources, trainingBanks, practicals, slides };
