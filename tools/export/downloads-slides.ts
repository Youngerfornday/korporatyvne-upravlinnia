import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Course } from '../../src/content/schemas/course.ts';
import type { DownloadItem } from '../../src/content/schemas/downloads.ts';
import { slidesItem } from './downloads-items.ts';
import { captured, writeStaged, type StepContext } from './downloads-steps.ts';
import { normalizePdfDates } from './pdf.ts';
import { planSlidesPdf, printSlidesPdfs } from './slides-pdf.ts';
import { runSlidesCli } from './slides/cli.ts';

/**
 * Презентації лекцій для кожної теми з `content/modules/mN/tNN/slides.yaml`: PPTX — генератором
 * tools/export/slides (дата збірки фіксує метадані), PDF — друком веб-режиму презентації зі зібраного сайту.
 * Chromium пише в PDF час створення, тому дати замінюються датою збірки, як і в PDF лекцій.
 */

export interface SlidesDeck {
  readonly topic: string;
  /** Згенеровані файли в робочому каталозі. */
  readonly pptxFile: string;
  readonly pdfFile: string;
}

export interface BuildSlidesOptions {
  readonly root: string;
  readonly course: Course;
  readonly siteDir: string;
  readonly basePath: string;
  readonly outDir: string;
  /** Дата збірки РРРР-ММ-ДД для метаданих PPTX. */
  readonly date: string;
}

export type BuildSlides = (options: BuildSlidesOptions) => Promise<readonly SlidesDeck[]>;

/** Типова збірка: CLI генератора PPTX на теми з slides.yaml, далі друк PDF тих самих тем. */
export const buildSlideDecks: BuildSlides = async (options) => {
  const jobs = await planSlidesPdf(options.course, options.root, options.outDir);
  if (jobs.length === 0) return [];
  const args = [...jobs.flatMap((job) => ['--topic', job.topic]), '--out', options.outDir, '--date', options.date];
  const { code, output } = await captured((io) => runSlidesCli(args, io, options.root));
  if (code !== 0) throw new Error(output.join('\n'));
  await printSlidesPdfs(jobs, options.siteDir, options.basePath);
  return jobs.map((job) => ({ topic: job.topic, pptxFile: join(options.outDir, `${job.topic}-${job.slug}.pptx`), pdfFile: job.outFile }));
};

export async function slidesStep(ctx: StepContext, buildSlides: BuildSlides): Promise<DownloadItem[]> {
  const { course, date } = ctx.sources;
  const decks = await buildSlides({
    root: ctx.root,
    course,
    siteDir: ctx.siteDir,
    basePath: new URL(ctx.siteUrl).pathname,
    outDir: join(ctx.workDir, 'slides'),
    date: date.toISOString().slice(0, 10),
  });
  const perDeck = await Promise.all(
    decks.map(async (deck) => {
      const topic = course.topics.find((candidate) => candidate.id === deck.topic);
      if (!topic) throw new Error(`генератор презентацій повернув невідому тему ${deck.topic}`);
      const pptx = await writeStaged(ctx, `${topic.module}/slides-${topic.id}.pptx`, await readFile(deck.pptxFile));
      const pdf = await writeStaged(ctx, `${topic.module}/slides-${topic.id}.pdf`, normalizePdfDates(await readFile(deck.pdfFile), date));
      return [slidesItem(course, topic, 'pptx', pptx), slidesItem(course, topic, 'pdf', pdf)];
    }),
  );
  return perDeck.flat();
}
