import type { Course } from '../../../src/content/schemas/course.ts';
import type { Inline } from './blocks.ts';
import { collectNotes, createNoteMarker, type Note, type NoteKey, type PlacedNote } from './notes.ts';

/** Спільні дані для побудови силабусу й робочої програми. */
export interface DocContext {
  readonly course: Course;
  /** Поля course.yaml, що потребують погодження. */
  readonly notes: readonly Note[];
  /** Значення з приміткою Word, якщо поле потребує погодження. */
  readonly mark: (key: NoteKey, text: string) => Inline;
  /** Примітки, розставлені в документі на цей момент. */
  readonly placedNotes: () => readonly PlacedNote[];
  /** Адреса живого сайту з base, закінчується на «/». */
  readonly siteUrl: string;
  readonly date: Date;
  /** Новий екземпляр нумерації: кожен нумерований список починається з 1. */
  readonly nextListInstance: () => number;
}

export interface DocOptions {
  readonly siteUrl: string;
  readonly date: Date;
}

export function createContext(course: Course, options: DocOptions): DocContext {
  let instance = 0;
  const notes = collectNotes(course);
  const marker = createNoteMarker(notes);
  return {
    course,
    notes,
    mark: marker.mark,
    placedNotes: marker.placed,
    siteUrl: options.siteUrl,
    date: options.date,
    nextListInstance: () => {
      instance += 1;
      return instance;
    },
  };
}

export function topicNumber(course: Course, topicId: string): number {
  return course.topics.findIndex((topic) => topic.id === topicId) + 1;
}

export function moduleNumber(course: Course, moduleId: string): number {
  return course.modules.findIndex((module) => module.id === moduleId) + 1;
}

export function practicalNumber(course: Course, practicalId: string): number {
  return course.practicals.findIndex((practical) => practical.id === practicalId) + 1;
}

export function topicLabels(course: Course, topicIds: readonly string[]): string {
  return topicIds.map((id) => `Т${topicNumber(course, id)}`).join(', ');
}

export function outcomeCodes(course: Course, outcomeIds: readonly string[]): string {
  return outcomeIds.map((id) => course.learningOutcomes.find((outcome) => outcome.id === id)?.code ?? id).join(', ');
}
