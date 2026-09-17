/** Дані кабінету під час збирання: реєстр курсу, колекції контенту, тренувальні банки й маніфест матеріалів. */
import { getCollection, getEntry } from 'astro:content';
import type { DownloadManifest } from '../../content/schemas/downloads';
import { url } from '../../lib/url';
import { loadTopicQuestions } from '../quiz/load-bank';
import { PUBLISHED_PRACTICALS, practicalPath } from '../trainers/catalog';
import { buildCatalog } from './catalog';
import { loadDownloadManifest } from './load-manifest';
import { buildOutcomeMatrix } from './matrix';
import type { Catalog, OutcomeMatrix } from './types';

export interface CabinetData {
  readonly catalog: Catalog;
  readonly matrix: OutcomeMatrix;
  readonly manifest: DownloadManifest | null;
}

export async function loadCabinetData(): Promise<CabinetData> {
  const courseEntry = await getEntry('course', 'course');
  if (!courseEntry) throw new Error('Не знайдено content/course.yaml');
  const course = courseEntry.data;
  const [lectures, glossaries, practicals] = await Promise.all([getCollection('topics'), getCollection('glossary'), getCollection('practicals')]);
  // Банки — через loadTopicQuestions, щоб E2E-збірка бачила той самий фікстурний банк, що й сторінка тесту.
  const questions = (await Promise.all(course.topics.map((topic) => loadTopicQuestions(topic.id)))).flat();
  const manifest = loadDownloadManifest();

  const catalog = buildCatalog({
    course,
    lectures: lectures.map((entry) => ({ id: entry.data.id, updatedAt: entry.data.updatedAt })),
    glossaries: glossaries.map((entry) => ({ topic: entry.data.topic, terms: entry.data.terms.map((term) => term.term) })),
    questions,
    practicalFiles: practicals.map((entry) => ({ id: entry.data.id, updatedAt: entry.data.updatedAt })),
    manifest,
    url,
    // Сторінки практичних публікує каталог тренажерів; неопублікована практична лишається без посилання.
    practicalPath: (id) => (PUBLISHED_PRACTICALS.includes(id) ? url(practicalPath(id)) : undefined),
  });
  const matrix = buildOutcomeMatrix(course, new Set(lectures.map((entry) => entry.data.id)));
  return { catalog, matrix, manifest };
}
