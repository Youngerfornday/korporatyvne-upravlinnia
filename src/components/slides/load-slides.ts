import { getCollection, type CollectionEntry } from 'astro:content';
import type { Slide } from '../../content/schemas/slides';
import type { Source } from '../../content/schemas/sources';
import type { CourseData, TopicView } from '../../lib/course-data';
import { sectionsOf, slideHeading, slideKicker } from './slides-pure';

/**
 * Презентації тем для сторінок сайту. Посилання слайдів (тема, схема, джерела, кейс) звіряються під час збірки:
 * лінт контенту в збірці лише попереджає, а зламане посилання дало б порожній слайд.
 */

/** SVG-схеми лонгрідів як текст: вставляються в слайд цілком, з <title>/<desc> і стилями на токенах. */
const FIGURES = import.meta.glob<string>('/content/modules/*/*/fig-*.svg', { query: '?raw', import: 'default', eager: true });
const TOPIC_FOLDER = /(?:^|\/)content\/modules\/(m\d+)\/(t\d{2})\/slides\.yaml$/;

export interface SlideView {
  readonly slide: Slide;
  readonly index: number;
  readonly heading: string;
  readonly kicker: string | undefined;
  readonly sources: readonly Source[];
  /** Розмітка SVG для слайда-схеми. */
  readonly figureSvg: string | undefined;
  /** Назва кейсу з реєстру для слайда-кейсу. */
  readonly caseTitle: string | undefined;
}

export interface DeckView {
  readonly topic: TopicView;
  readonly slides: readonly SlideView[];
}

type SlidesEntry = CollectionEntry<'slides'>;

function folderOf(entry: SlidesEntry): { module: string; topic: string } {
  const match = TOPIC_FOLDER.exec(entry.filePath ?? '');
  if (!match?.[1] || !match[2]) throw new Error(`Презентація ${entry.id}: файл має лежати в content/modules/mN/tNN/slides.yaml`);
  return { module: match[1], topic: match[2] };
}

export async function loadSlidesEntries(): Promise<readonly SlidesEntry[]> {
  const entries = await getCollection('slides');
  for (const entry of entries) {
    const folder = folderOf(entry);
    if (folder.topic !== entry.data.topic) {
      throw new Error(`Презентація ${entry.filePath}: topic ${entry.data.topic} не збігається з каталогом теми ${folder.topic}`);
    }
  }
  return entries;
}

/** Теми, для яких є презентація: кнопка на сторінці теми і маршрути веб-режиму. */
export async function topicsWithSlides(): Promise<ReadonlySet<string>> {
  return new Set((await loadSlidesEntries()).map((entry) => entry.data.topic));
}

function figureFor(entry: SlidesEntry, slide: Slide): string | undefined {
  if (slide.type !== 'figure') return undefined;
  const { module, topic } = folderOf(entry);
  const svg = FIGURES[`/content/modules/${module}/${topic}/${slide.figure}`];
  if (svg === undefined) throw new Error(`Презентація ${entry.filePath}, слайд «${slide.id}»: немає файлу схеми ${slide.figure}`);
  return svg;
}

function sourcesFor(entry: SlidesEntry, slide: Slide, known: readonly Source[]): Source[] {
  return slide.sources.map((id) => {
    const source = known.find((item) => item.id === id);
    if (!source) throw new Error(`Презентація ${entry.filePath}, слайд «${slide.id}»: джерела «${id}» немає в sources.yaml теми`);
    return source;
  });
}

function caseTitleFor(entry: SlidesEntry, slide: Slide, data: CourseData): string | undefined {
  if (slide.type !== 'case') return undefined;
  const registered = data.course.cases.find((item) => item.id === slide.case);
  if (!registered) throw new Error(`Презентація ${entry.filePath}, слайд «${slide.id}»: кейс «${slide.case}» не зареєстровано в course.yaml`);
  return registered.title;
}

export function buildDeck(entry: SlidesEntry, topic: TopicView, data: CourseData): DeckView {
  const known = data.sources.find((item) => item.data.topic === topic.id)?.data.sources ?? [];
  const sections = sectionsOf(entry.data.slides);
  const slides = entry.data.slides.map((slide, index) => ({
    slide,
    index,
    heading: slideHeading(slide, topic.title),
    kicker: slideKicker(slide, sections[index], topic.number),
    sources: sourcesFor(entry, slide, known),
    figureSvg: figureFor(entry, slide),
    caseTitle: caseTitleFor(entry, slide, data),
  }));
  return { topic, slides };
}
