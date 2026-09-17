import type { Course } from '../../src/content/schemas/course.ts';
import type { DownloadItem } from '../../src/content/schemas/downloads.ts';
import { pluralUk } from '../../src/lib/plural.ts';

/**
 * Елементи маніфесту `public/downloads/manifest.json`: назви, описи, прив'язка до модуля/теми/практичної.
 * Чисті функції без доступу до диска: розміри й кількості передає оркестратор `downloads.ts`.
 */

export const DOWNLOADS_DIR = 'downloads';

const PAGE_FORMS = { one: 'сторінка', few: 'сторінки', many: 'сторінок', other: 'сторінки' };
const QUESTION_FORMS = { one: 'питання', few: 'питання', many: 'питань', other: 'питання' };
const TERM_FORMS = { one: 'термін', few: 'терміни', many: 'термінів', other: 'терміна' };
const CHAPTER_FORMS = { one: 'глава', few: 'глави', many: 'глав', other: 'глави' };

type Topic = Course['topics'][number];
type Practical = Course['practicals'][number];

/** Файл у каталозі матеріалів: шлях від `downloads/` і розмір у байтах. */
export interface ProducedFile {
  readonly file: string;
  readonly bytes: number;
}

function sitePath(file: string): string {
  return `${DOWNLOADS_DIR}/${file}`;
}

function topicNumber(course: Course, topicId: string): number {
  return course.topics.findIndex((topic) => topic.id === topicId) + 1;
}

function moduleLabel(course: Course, moduleId: string): string {
  const index = course.modules.findIndex((module) => module.id === moduleId);
  return `Модуль ${index + 1}. ${course.modules[index]?.title ?? moduleId}`;
}

export function lectureItem(course: Course, topic: Topic, produced: ProducedFile, pages: number): DownloadItem {
  return {
    id: `lecture-${topic.id}`,
    title: `Лекція. Тема ${topicNumber(course, topic.id)}. ${topic.title}`,
    description: `PDF A4 для друку й читання офлайн, ${pluralUk(pages, PAGE_FORMS)}.`,
    kind: 'lecture',
    format: 'pdf',
    audience: 'student',
    module: topic.module,
    topic: topic.id,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function practicalItem(course: Course, practical: Practical, produced: ProducedFile, pages: number): DownloadItem {
  const number = course.practicals.findIndex((candidate) => candidate.id === practical.id) + 1;
  return {
    id: `practical-${practical.id}`,
    title: `Практична робота ${number}. ${practical.title}`,
    description: `Умови, вихідні дані й рубрика оцінювання; PDF A4, ${pluralUk(pages, PAGE_FORMS)}.`,
    kind: 'practical',
    format: 'pdf',
    audience: 'student',
    module: practical.module,
    topic: practical.topics[0],
    practical: practical.id,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function bookItem(course: Course, topic: Topic, produced: ProducedFile, chapters: number, images: number): DownloadItem {
  return {
    id: `book-${topic.id}`,
    title: `Книга Moodle. Тема ${topicNumber(course, topic.id)}. ${topic.title}`,
    description: `ZIP глав для імпорту в модуль «Книга»: ${pluralUk(chapters, CHAPTER_FORMS)}, схем — ${images}.`,
    kind: 'book',
    format: 'zip',
    audience: 'teacher',
    module: topic.module,
    topic: topic.id,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

/** Область файлу Moodle XML: модуль (m1…), весь курс (course) або підсумковий пул (final). */
export type XmlScope = { readonly kind: 'module'; readonly module: string } | { readonly kind: 'course' } | { readonly kind: 'final' };

export function questionBankItem(course: Course, scope: XmlScope, produced: ProducedFile, questions: number): DownloadItem {
  const count = pluralUk(questions, QUESTION_FORMS);
  const base = { kind: 'question-bank', format: 'xml', audience: 'teacher', path: sitePath(produced.file), bytes: produced.bytes } as const;
  const description = `Moodle XML для імпорту в банк питань: ${count} з поясненнями, категорії за темами, теги рівнів Блума.`;
  switch (scope.kind) {
    case 'module':
      return { ...base, id: `questions-training-${scope.module}`, title: `Тренувальні питання. ${moduleLabel(course, scope.module)}`, description, module: scope.module };
    case 'course':
      return { ...base, id: 'questions-training-course', title: 'Тренувальні питання курсу (усі модулі)', description };
    case 'final':
      return { ...base, id: 'questions-training-final', title: 'Тренувальні питання підсумкового пулу', description };
  }
}

export function glossaryItem(course: Course, scope: XmlScope, produced: ProducedFile, terms: number): DownloadItem {
  const description = `Moodle XML для модуля «Глосарій» (Імпорт записів): ${pluralUk(terms, TERM_FORMS)} з категоріями.`;
  const base = { kind: 'glossary', format: 'xml', audience: 'teacher', path: sitePath(produced.file), bytes: produced.bytes, description } as const;
  return scope.kind === 'module'
    ? { ...base, id: `glossary-${scope.module}`, title: `Глосарій. ${moduleLabel(course, scope.module)}`, module: scope.module }
    : { ...base, id: 'glossary-course', title: `Глосарій курсу «${course.title}»` };
}

export function syllabusItem(course: Course, produced: ProducedFile): DownloadItem {
  return {
    id: 'syllabus',
    title: `Силабус навчальної дисципліни «${course.title}»`,
    description: 'DOCX, Times New Roman 14. Значення, які має погодити кафедра, виділено й пояснено примітками Word.',
    kind: 'syllabus',
    format: 'docx',
    audience: 'student',
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function workProgramItem(course: Course, produced: ProducedFile): DownloadItem {
  return {
    id: 'work-program',
    title: `Робоча програма навчальної дисципліни «${course.title}»`,
    description: 'DOCX, Times New Roman 14: години за темами, тематичні плани, СРС, оцінювання з рубриками, політики, календар, література. Поля для погодження позначено примітками.',
    kind: 'work-program',
    format: 'docx',
    audience: 'teacher',
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export const COURSE_BUNDLE_TITLE = 'Курс повністю';

export function moduleBundleTitle(course: Course, moduleId: string): string {
  return `Модуль ${course.modules.findIndex((module) => module.id === moduleId) + 1} — усі матеріали`;
}

export function moduleBundleItem(course: Course, moduleId: string, produced: ProducedFile): DownloadItem {
  return {
    id: `bundle-${moduleId}`,
    title: moduleBundleTitle(course, moduleId),
    description: `ZIP: лекції й практичні в PDF, Moodle XML питань і глосарію, ZIP глав Книги, README.txt. ${moduleLabel(course, moduleId)}.`,
    kind: 'bundle',
    format: 'zip',
    audience: 'teacher',
    module: moduleId,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function courseBundleItem(produced: ProducedFile): DownloadItem {
  return {
    id: 'bundle-course',
    title: COURSE_BUNDLE_TITLE,
    description: 'ZIP: усі PDF, силабус і робоча програма DOCX, Moodle XML питань і глосарію, ZIP глав Книги, README.txt.',
    kind: 'bundle',
    format: 'zip',
    audience: 'teacher',
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export interface BackupRelease {
  readonly url: string;
  readonly bytes: number;
  readonly moodle: string;
}

export function backupItem(release: BackupRelease): DownloadItem {
  return {
    id: 'backup-course',
    title: `Резервна копія курсу для Moodle ${release.moodle} (.mbz)`,
    description:
      'Курс без даних користувачів: розділи модулів, Книги, завдання з рубриками, тренувальні тести, журнал оцінок. Відновлює викладач із правом редагування або адміністратор; контрольні тести — у приватному репозиторії.',
    kind: 'backup',
    format: 'mbz',
    audience: 'teacher',
    url: release.url,
    bytes: release.bytes,
  };
}

const KIND_ORDER: readonly DownloadItem['kind'][] = ['syllabus', 'work-program', 'lecture', 'practical', 'book', 'question-bank', 'glossary', 'scorm', 'bundle', 'backup'];

/**
 * Сталий порядок маніфесту: документи курсу; далі модулі за порядком (матеріали за видом, пакет модуля останнім);
 * далі файли на весь курс; пакет курсу й резервна копія — наприкінці.
 */
export function orderItems(course: Course, items: readonly DownloadItem[]): DownloadItem[] {
  const moduleIndex = (item: DownloadItem): number =>
    item.module === undefined ? (item.kind === 'syllabus' || item.kind === 'work-program' ? -1 : course.modules.length) : course.modules.findIndex((m) => m.id === item.module);
  const rank = (item: DownloadItem): readonly number[] => [
    moduleIndex(item),
    KIND_ORDER.indexOf(item.kind),
    item.topic === undefined ? 0 : topicNumber(course, item.topic),
  ];
  return [...items].sort((left, right) => {
    const a = rank(left);
    const b = rank(right);
    const diff = a.findIndex((value, index) => value !== b[index]);
    return diff === -1 ? left.id.localeCompare(right.id) : (a[diff] ?? 0) - (b[diff] ?? 0);
  });
}
