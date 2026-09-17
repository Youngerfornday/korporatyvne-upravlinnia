/**
 * Реєстр матеріалів кабінету: лекції (опубліковані й «готується»), практичні, тренувальні банки, глосарії
 * з course.yaml і колекцій контенту, доповнені файлами з маніфесту матеріалів. Чиста функція без astro:content:
 * завантаження — у load-catalog.ts, тести — у catalog.test.ts.
 */
import type { Course } from '../../content/schemas/course';
import type { DownloadItem, DownloadKind, DownloadManifest } from '../../content/schemas/downloads';
import type { BloomLevel, Question } from '../../content/schemas/questions';
import { formatDate, outcomeLabel } from '../../lib/course-data-pure';
import { bankBrowserPath, quizPath } from '../../lib/site-nav';
import { questionTypeLabel } from '../quiz/quiz-texts';
import { normalizeSearch } from './search';
import { QUESTION_FORMS, TERM_FORMS, pluralUk } from './texts';
import { BLOOM_LEVELS, type Catalog, type Material, type MaterialFile, type MaterialType } from './types';

export interface LectureInfo {
  readonly id: string;
  readonly updatedAt: string;
}

export interface GlossaryInfo {
  readonly topic: string;
  readonly terms: readonly string[];
}

export interface PracticalFileInfo {
  readonly id: string;
  readonly updatedAt?: string | undefined;
}

export interface CatalogInput {
  readonly course: Course;
  readonly lectures: readonly LectureInfo[];
  readonly glossaries: readonly GlossaryInfo[];
  /** Питання тренувальних банків (контрольних на сайті немає). */
  readonly questions: readonly Question[];
  readonly practicalFiles: readonly PracticalFileInfo[];
  readonly manifest: DownloadManifest | null;
  /** url() з base: передається ззовні, щоб функція не залежала від import.meta.env. */
  readonly url: (path: string) => string;
  /** Шлях сторінки практичної, якщо сторінки практичних уже опубліковано. */
  readonly practicalPath?: ((id: string) => string | undefined) | undefined;
}

const TYPE_RANK: Readonly<Record<MaterialType, number>> = { lecture: 0, bank: 1, glossary: 2, practical: 3, document: 4 };
const PACKAGE_KINDS: ReadonlySet<DownloadKind> = new Set<DownloadKind>(['bundle', 'backup']);
const SUBTITLE_TERMS = 4;

interface Numbering {
  readonly moduleNumber: (id: string | undefined) => number | undefined;
  readonly topicNumber: (id: string | undefined) => number | undefined;
  readonly topicModule: (id: string | undefined) => string | undefined;
  readonly practicalNumber: (id: string | undefined) => number | undefined;
}

function numbering(course: Course): Numbering {
  const indexOf = (ids: readonly string[], id: string | undefined) => (id === undefined ? -1 : ids.indexOf(id));
  const oneBased = (index: number) => (index >= 0 ? index + 1 : undefined);
  const moduleIds = course.modules.map((m) => m.id);
  const topicIds = course.topics.map((t) => t.id);
  const practicalIds = course.practicals.map((p) => p.id);
  return {
    moduleNumber: (id) => oneBased(indexOf(moduleIds, id)),
    topicNumber: (id) => oneBased(indexOf(topicIds, id)),
    topicModule: (id) => course.topics.find((t) => t.id === id)?.module,
    practicalNumber: (id) => oneBased(indexOf(practicalIds, id)),
  };
}

/** Документи курсу (силабус, РП) — на початку; файли всього курсу (банк, глосарій одним файлом) — у кінці. */
const COURSE_WIDE_MODULE = 99;

function orderOf(moduleNumber: number | undefined, topicNumber: number | undefined, type: MaterialType, sequence: number): number {
  const module = moduleNumber ?? (type === 'document' ? 0 : COURSE_WIDE_MODULE);
  return module * 100_000 + (topicNumber ?? 0) * 1_000 + TYPE_RANK[type] * 100 + sequence;
}

function extensionOf(item: DownloadItem): string {
  const source = item.path ?? item.url ?? '';
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(source);
  return (match?.[1] ?? item.format).toLowerCase();
}

function toFile(item: DownloadItem, input: CatalogInput, numbers: Numbering): MaterialFile {
  const moduleNumber = numbers.moduleNumber(item.module ?? numbers.topicModule(item.topic));
  return {
    id: item.id,
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    kind: item.kind,
    format: item.format,
    audience: item.audience,
    bytes: item.bytes,
    href: item.url ?? input.url(item.path ?? ''),
    external: item.url !== undefined,
    extension: extensionOf(item),
    ...(moduleNumber ? { moduleNumber } : {}),
  };
}

function uniqueCodes(course: Course, ids: readonly string[]): string[] {
  return [...new Set(ids)].sort().map((id) => outcomeLabel(course, id));
}

/** Пошук за «ПРН3» і «ПРН 3», «Т1» і «Тема 1». */
function searchTokens(outcomes: readonly string[], topicNumber: number | undefined): string[] {
  const outcomeTokens = outcomes.flatMap((code) => [code, code.replace(/(\D)(\d)/, '$1 $2')]);
  return topicNumber ? [...outcomeTokens, `Т${topicNumber}`, `Тема ${topicNumber}`] : outcomeTokens;
}

function bloomDistribution(questions: readonly Question[]): Record<BloomLevel, number> {
  return Object.fromEntries(BLOOM_LEVELS.map((level) => [level, questions.filter((q) => q.bloom === level).length])) as Record<
    BloomLevel,
    number
  >;
}

function typeCounts(questions: readonly Question[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const question of questions) {
    const label = questionTypeLabel(question);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'uk'));
}

function withDate(updatedAt: string | undefined): Pick<Material, 'updatedAt' | 'updatedLabel'> {
  return updatedAt ? { updatedAt, updatedLabel: formatDate(updatedAt) } : {};
}

function topicMaterials(input: CatalogInput, numbers: Numbering): Material[] {
  const { course } = input;
  return course.topics.flatMap((topic, index): Material[] => {
    const topicNumber = index + 1;
    const moduleNumber = numbers.moduleNumber(topic.module);
    const lecture = input.lectures.find((entry) => entry.id === topic.id);
    const terms = input.glossaries.find((entry) => entry.topic === topic.id)?.terms ?? [];
    const questions = input.questions.filter((question) => question.topic === topic.id);
    const outcomes = uniqueCodes(course, topic.results.flatMap((result) => result.prn));
    const topicPage = input.url(`temy/${topic.slug}/`);
    const base = { moduleId: topic.module, topicId: topic.id, topicNumber, ...(moduleNumber ? { moduleNumber } : {}) };
    const tokens = searchTokens(outcomes, topicNumber);

    const materials: Material[] = [
      {
        ...base,
        id: `lecture-${topic.id}`,
        type: 'lecture',
        title: `Лекція ${topicNumber}. ${topic.title}`,
        subtitle: topic.summary,
        status: lecture ? 'published' : 'pending',
        outcomes,
        href: topicPage,
        ...withDate(lecture?.updatedAt),
        searchText: normalizeSearch([topic.title, topic.summary, ...terms, ...tokens].join(' ')),
        files: [],
        order: orderOf(moduleNumber, topicNumber, 'lecture', 0),
      },
    ];

    if (questions.length > 0) {
      const types = typeCounts(questions);
      materials.push({
        ...base,
        id: `bank-${topic.id}`,
        type: 'bank',
        title: `Тренувальний тест ${topicNumber}`,
        subtitle: `${pluralUk(questions.length, QUESTION_FORMS)}: ${types.map((t) => `${t.label} ${t.count}`).join(', ')}`,
        status: 'published',
        outcomes,
        bloom: bloomDistribution(questions),
        questionCount: questions.length,
        questionTypes: types,
        href: input.url(quizPath(topic.slug)),
        bankHref: input.url(bankBrowserPath(topic.slug)),
        searchText: normalizeSearch(['тренувальний тест банк питань', topic.title, ...tokens].join(' ')),
        files: [],
        order: orderOf(moduleNumber, topicNumber, 'bank', 0),
      });
    }

    if (terms.length > 0) {
      const preview = terms.slice(0, SUBTITLE_TERMS).join(', ');
      materials.push({
        ...base,
        id: `glossary-${topic.id}`,
        type: 'glossary',
        title: `Глосарій теми ${topicNumber}`,
        subtitle: `${pluralUk(terms.length, TERM_FORMS)}: ${preview}${terms.length > SUBTITLE_TERMS ? '…' : ''}`,
        status: 'published',
        outcomes: [],
        href: topicPage,
        searchText: normalizeSearch(['глосарій терміни', topic.title, ...terms, `Т${topicNumber}`, `Тема ${topicNumber}`].join(' ')),
        files: [],
        order: orderOf(moduleNumber, topicNumber, 'glossary', 0),
      });
    }
    return materials;
  });
}

function practicalMaterials(input: CatalogInput, numbers: Numbering): Material[] {
  const { course } = input;
  return course.practicals.map((practical, index) => {
    const practicalNumber = index + 1;
    const moduleNumber = numbers.moduleNumber(practical.module);
    const mainTopic = numbers.topicNumber(practical.topics[0]);
    const file = input.practicalFiles.find((entry) => entry.id === practical.id);
    const outcomes = uniqueCodes(course, practical.prn);
    const topicTokens = practical.topics.flatMap((id) => {
      const n = numbers.topicNumber(id);
      return n ? [`Т${n}`, `Тема ${n}`] : [];
    });
    const href = file ? input.practicalPath?.(practical.id) : undefined;
    return {
      id: `practical-${practical.id}`,
      type: 'practical' as const,
      title: `Практична ${practicalNumber}. ${practical.title}`,
      subtitle: practical.goal,
      status: file ? ('published' as const) : ('pending' as const),
      moduleId: practical.module,
      ...(moduleNumber ? { moduleNumber } : {}),
      ...(mainTopic ? { topicNumber: mainTopic, topicId: practical.topics[0] } : {}),
      practicalNumber,
      outcomes,
      ...(href ? { href } : {}),
      ...withDate(file?.updatedAt),
      searchText: normalizeSearch([practical.title, practical.goal, `П${practicalNumber}`, ...searchTokens(outcomes, undefined), ...topicTokens].join(' ')),
      files: [],
      order: orderOf(moduleNumber, mainTopic, 'practical', practicalNumber),
    };
  });
}

/** До якого матеріалу реєстру належить файл маніфесту; undefined — файл стає окремим матеріалом. */
function targetId(item: DownloadItem): string {
  if (item.practical) return `practical-${item.practical}`;
  if (item.topic && item.kind === 'question-bank') return `bank-${item.topic}`;
  if (item.topic && item.kind === 'glossary') return `glossary-${item.topic}`;
  if (item.topic) return `lecture-${item.topic}`;
  return `file-${item.id}`;
}

const KIND_TYPE: Partial<Record<DownloadKind, MaterialType>> = {
  lecture: 'lecture',
  slides: 'lecture',
  book: 'lecture',
  practical: 'practical',
  scorm: 'practical',
  glossary: 'glossary',
  'question-bank': 'bank',
};

/** Файл без відповідника в реєстрі (модульний банк XML, силабус) — окремий опублікований матеріал. */
function standaloneMaterial(item: DownloadItem, id: string, input: CatalogInput, numbers: Numbering, sequence: number): Material {
  const type = KIND_TYPE[item.kind] ?? 'document';
  const moduleId = item.module ?? numbers.topicModule(item.topic);
  const moduleNumber = numbers.moduleNumber(moduleId);
  const topicNumber = numbers.topicNumber(item.topic);
  const practicalNumber = numbers.practicalNumber(item.practical);
  return {
    id,
    type,
    title: item.title,
    subtitle: item.description ?? '',
    status: 'published',
    ...(moduleId ? { moduleId } : {}),
    ...(moduleNumber ? { moduleNumber } : {}),
    ...(item.topic && topicNumber ? { topicId: item.topic, topicNumber } : {}),
    ...(practicalNumber ? { practicalNumber } : {}),
    outcomes: [],
    ...withDate(input.manifest?.generatedAt.slice(0, 10)),
    searchText: normalizeSearch([item.title, item.description ?? '', topicNumber ? `Т${topicNumber} Тема ${topicNumber}` : ''].join(' ')),
    files: [],
    order: orderOf(moduleNumber, topicNumber, type, 50 + sequence),
  };
}

function attachFiles(registry: readonly Material[], input: CatalogInput, numbers: Numbering): Material[] {
  const items = (input.manifest?.items ?? []).filter((item) => !PACKAGE_KINDS.has(item.kind));
  const byId = new Map(registry.map((material) => [material.id, material]));
  items.forEach((item, sequence) => {
    const id = targetId(item);
    const material = byId.get(id) ?? standaloneMaterial(item, id, input, numbers, sequence);
    const searchText = normalizeSearch(`${material.searchText} ${item.title}`);
    byId.set(id, { ...material, searchText, files: [...material.files, toFile(item, input, numbers)] });
  });
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

function latestDate(materials: readonly Material[], manifest: DownloadManifest | null): string | undefined {
  const dates = materials.flatMap((material) => (material.updatedAt ? [material.updatedAt] : []));
  if (manifest) dates.push(manifest.generatedAt.slice(0, 10));
  return dates.sort().at(-1);
}

export function buildCatalog(input: CatalogInput): Catalog {
  const numbers = numbering(input.course);
  const registry = [...topicMaterials(input, numbers), ...practicalMaterials(input, numbers)];
  const materials = attachFiles(registry, input, numbers);
  const packages = (input.manifest?.items ?? []).filter((item) => PACKAGE_KINDS.has(item.kind)).map((item) => toFile(item, input, numbers));
  const updatedAt = latestDate(materials, input.manifest);
  return {
    courseTitle: input.course.title,
    materials,
    modules: input.course.modules.map((module, index) => ({ id: module.id, number: index + 1, title: module.title })),
    packages,
    manifestGeneratedAt: input.manifest?.generatedAt ?? null,
    topicCount: input.course.topics.length,
    outcomeCount: input.course.learningOutcomes.length,
    ...(updatedAt ? { updatedLabel: formatDate(updatedAt) } : {}),
  };
}
