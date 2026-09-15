import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import type { Course } from '../content/schemas/course';

/** Тема з реєстру, доповнена наскрізним номером, номером у модулі й даними лекції (якщо вона є). */
export interface TopicView {
  readonly id: string;
  readonly module: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** Наскрізний номер 1–12. */
  readonly number: number;
  /** Номер усередині модуля 1–3. */
  readonly numberInModule: number;
  readonly lecture: CollectionEntry<'topics'> | undefined;
  readonly readingMinutes: number | undefined;
  readonly termCount: number;
}

export interface ModuleView {
  readonly id: string;
  readonly title: string;
  readonly number: number;
  readonly topics: readonly TopicView[];
}

export interface CourseData {
  readonly course: Course;
  readonly modules: readonly ModuleView[];
  readonly topics: readonly TopicView[];
  readonly glossary: readonly CollectionEntry<'glossary'>[];
  readonly sources: readonly CollectionEntry<'sources'>[];
}

export { TOPIC_XP, estimateReadingMinutes, formatDate, minutesLabel, outcomeLabel } from './course-data-pure';
import { estimateReadingMinutes } from './course-data-pure';

export async function loadCourseData(): Promise<CourseData> {
  const courseEntry = await getEntry('course', 'course');
  if (!courseEntry) throw new Error('Не знайдено content/course.yaml');
  const course = courseEntry.data;
  const [lectures, glossary, sources] = await Promise.all([getCollection('topics'), getCollection('glossary'), getCollection('sources')]);

  const topics: TopicView[] = course.topics.map((topic, index) => {
    const lecture = lectures.find((entry) => entry.data.id === topic.id);
    const terms = glossary.find((entry) => entry.data.topic === topic.id)?.data.terms.length ?? 0;
    const numberInModule = course.topics.filter((t, i) => t.module === topic.module && i <= index).length;
    return {
      ...topic,
      number: index + 1,
      numberInModule,
      lecture,
      readingMinutes: lecture?.data.readingMinutes ?? estimateReadingMinutes(lecture?.body),
      termCount: terms,
    };
  });

  const modules: ModuleView[] = course.modules.map((module, index) => ({
    ...module,
    number: index + 1,
    topics: topics.filter((topic) => topic.module === module.id),
  }));

  return { course, modules, topics, glossary, sources };
}

export function neighbours(topics: readonly TopicView[], id: string): { prev: TopicView | undefined; next: TopicView | undefined } {
  const index = topics.findIndex((topic) => topic.id === id);
  return { prev: index > 0 ? topics[index - 1] : undefined, next: index >= 0 ? topics[index + 1] : undefined };
}
