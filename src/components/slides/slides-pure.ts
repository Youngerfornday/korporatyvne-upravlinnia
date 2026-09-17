import type { Slide } from '../../content/schemas/slides';
import type { Source } from '../../content/schemas/sources';

/**
 * Чисті допоміжні функції презентації теми для збірки сторінки: маршрут, підписи джерел, розділи, заголовки,
 * абзаци нотаток. Без astro:content, тож їх використовують і тести, і експорт.
 */

/** Маршрут веб-режиму презентації теми (для url()). */
export function slidesPath(slug: string): string {
  return `temy/${slug}/prezentatsiia/`;
}

const MAX_NAMED_AUTHORS = 2;

/** Короткий підпис джерела в колонтитулі слайда: «Jensen M. C., Meckling W. H., 1976». */
export function sourceLabel(source: Pick<Source, 'authors' | 'title' | 'year'>): string {
  const authors = source.authors.length > MAX_NAMED_AUTHORS ? `${source.authors[0]} та ін.` : source.authors.join(', ');
  const name = authors === '' ? source.title : authors;
  return source.year === undefined ? name : `${name}, ${source.year}`;
}

export interface SectionRef {
  readonly number: number | undefined;
  readonly title: string;
}

/** Розділ кожного слайда: останній слайд-розділ перед ним (або він сам). */
export function sectionsOf(slides: readonly Slide[]): ReadonlyArray<SectionRef | undefined> {
  return slides.reduce<ReadonlyArray<SectionRef | undefined>>((acc, slide) => {
    const previous = acc.at(-1);
    const current = slide.type === 'section' ? { number: slide.number, title: slide.title } : previous;
    return [...acc, current];
  }, []);
}

const ROLE_KICKERS: Partial<Record<Slide['type'], string>> = {
  outcomes: 'Результати навчання',
  case: 'Кейс для аналізу',
  question: 'Питання до аудиторії',
  summary: 'Підсумок',
};

/** Рядок над заголовком змістового слайда: «1.2 · Назва розділу» або роль слайда. */
export function slideKicker(slide: Slide, section: SectionRef | undefined, topicNumber: number): string | undefined {
  const role = ROLE_KICKERS[slide.type];
  if (role !== undefined) return role;
  if (section === undefined) return undefined;
  return section.number === undefined ? section.title : `${topicNumber}.${section.number} · ${section.title}`;
}

/** Доступна назва слайда: для підпису регіону й оголошення номера. */
export function slideHeading(slide: Slide, topicTitle: string): string {
  switch (slide.type) {
    case 'title':
      return topicTitle;
    case 'question':
      return 'Питання до аудиторії';
    case 'quote':
      return `Цитата: ${slide.attribution}`;
    default:
      return slide.title;
  }
}

/** Маркери, з яких у нотатках доповідача починається новий абзац. */
const NOTE_MARKERS = ['Приклад:', 'Приклад для самостійної роботи:', 'Питання до аудиторії:', 'Обережно з висновками:', 'Застереження:'];
const NOTE_BREAK = new RegExp(`\\s+(?=(?:${NOTE_MARKERS.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'u');

export function notesParagraphs(notes: string): string[] {
  return notes.split(NOTE_BREAK).map((part) => part.trim()).filter((part) => part !== '');
}

const OPTION_LETTERS = ['А', 'Б', 'В', 'Г'] as const;

export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}
