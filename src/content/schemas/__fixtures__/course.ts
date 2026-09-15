import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { z } from 'zod';
import { CourseSchema } from '../course';

/** Вхідні дані схеми курсу: тести модифікують копію реального content/course.yaml. */
export type CourseInput = z.input<typeof CourseSchema>;

const COURSE_FILE = new URL('../../../../content/course.yaml', import.meta.url);
const courseYaml: unknown = parse(readFileSync(COURSE_FILE, 'utf8'));

/** Свіжа глибока копія course.yaml: зміна в одному тесті не впливає на інші. */
export function loadCourse(): CourseInput {
  return structuredClone(courseYaml) as CourseInput;
}

/** Копія курсу з точковою зміною (як у immer): оригінал лишається незмінним. */
export function mutated(change: (draft: CourseInput) => void): CourseInput {
  const draft = loadCourse();
  change(draft);
  return draft;
}

export function issuesOf(input: unknown): string[] {
  const result = CourseSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

/** Елемент масиву за індексом з явною помилкою замість undefined (noUncheckedIndexedAccess). */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Немає елемента з індексом ${index}`);
  return item;
}

export function byId<T extends { id: string }>(items: readonly T[], id: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`Немає елемента «${id}»`);
  return item;
}
