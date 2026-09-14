import { readFile } from 'node:fs/promises';
import type { Loader } from 'astro/loaders';
import { parse } from 'yaml';
import { z } from 'zod';
import { CourseSchema, type Course } from '../schemas/course';
import { formatIssues, type ContentEntry, type ContentIssue } from './checks';

export const COURSE_FILE = 'content/course.yaml';

type IntegrityCheck<T> = (entries: ReadonlyArray<ContentEntry<T>>, course: Course) => ContentIssue[];

async function readCourse(root: URL): Promise<Course> {
  const parsed = CourseSchema.safeParse(parse(await readFile(new URL(COURSE_FILE, root), 'utf8')));
  if (!parsed.success) {
    throw new Error(`${COURSE_FILE} не пройшов валідацію:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * Обгортка над glob(): після завантаження колекції звіряє всі записи між собою і з реєстром course.yaml.
 * Будь-яка проблема кидає помилку, тож `astro check` / `astro build` падають.
 * Обмеження: у `astro dev` правки окремих файлів підхоплює watcher glob() без повторної перевірки —
 * повна перевірка виконується під час запуску dev-сервера і кожної збірки.
 */
export function withIntegrityCheck<T>(inner: Loader, check: IntegrityCheck<T>): Loader {
  return {
    name: `${inner.name}+integrity`,
    load: async (context) => {
      await inner.load(context);
      const course = await readCourse(context.config.root);
      const entries = context.store.values().map((entry) => ({
        filePath: entry.filePath ?? entry.id,
        // Дані вже провалідовано схемою колекції через parseData() усередині glob().
        data: entry.data as T,
      }));
      const issues = check(entries, course);
      if (issues.length > 0) throw new Error(formatIssues(context.collection, issues));
    },
  };
}
