import type { Course } from '../../src/content/schemas/course.ts';
import type { DownloadItem } from '../../src/content/schemas/downloads.ts';

/**
 * Елементи маніфесту `public/downloads/manifest.json`: назви, описи, прив'язка до модуля/теми/практичної.
 * Чисті функції без доступу до диска: розміри передає оркестратор `downloads.ts`.
 */

export const DOWNLOADS_DIR = 'downloads';

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

function moduleNumber(course: Course, moduleId: string): number {
  return course.modules.findIndex((module) => module.id === moduleId) + 1;
}

function moduleLabel(course: Course, moduleId: string): string {
  const title = course.modules.find((module) => module.id === moduleId)?.title ?? moduleId;
  return `Модуль ${moduleNumber(course, moduleId)}. ${title}`;
}

function topicLabel(course: Course, topic: Topic): string {
  return `Тема ${topicNumber(course, topic.id)}. ${topic.title}`;
}

export function lectureItem(course: Course, topic: Topic, produced: ProducedFile): DownloadItem {
  return {
    id: `lecture-${topic.id}`,
    title: `Лекція. ${topicLabel(course, topic)}`,
    description: 'Текст лекції для читання без інтернету й друку.',
    kind: 'lecture',
    format: 'pdf',
    audience: 'student',
    module: topic.module,
    topic: topic.id,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function practicalItem(course: Course, practical: Practical, produced: ProducedFile): DownloadItem {
  const number = course.practicals.findIndex((candidate) => candidate.id === practical.id) + 1;
  return {
    id: `practical-${practical.id}`,
    title: `Практична робота ${number}. ${practical.title}`,
    description: 'Умови практичної роботи з вихідними даними й рубрикою оцінювання.',
    kind: 'practical',
    format: 'pdf',
    audience: 'student',
    module: practical.module,
    practical: practical.id,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function bookItem(course: Course, topic: Topic, produced: ProducedFile): DownloadItem {
  return {
    id: `book-${topic.id}`,
    title: `Книга Moodle. ${topicLabel(course, topic)}`,
    description: 'Глави лекції для імпорту в модуль «Книга» в Moodle.',
    kind: 'book',
    format: 'zip',
    audience: 'teacher',
    module: topic.module,
    topic: topic.id,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

/** Область файлу Moodle XML: тема, модуль, весь курс або підсумковий пул. */
export type XmlScope =
  | { readonly kind: 'topic'; readonly topic: Topic }
  | { readonly kind: 'module'; readonly module: string }
  | { readonly kind: 'course' }
  | { readonly kind: 'final' };

/** id-суфікс, назва, пояснення «чого» і прив'язка до модуля й теми для області файлу. */
function scoped(course: Course, scope: XmlScope): { suffix: string; label: string; whose: string; place: Pick<DownloadItem, 'module' | 'topic'> } {
  switch (scope.kind) {
    case 'topic':
      return { suffix: scope.topic.id, label: topicLabel(course, scope.topic), whose: 'теми', place: { module: scope.topic.module, topic: scope.topic.id } };
    case 'module':
      return { suffix: scope.module, label: moduleLabel(course, scope.module), whose: 'модуля', place: { module: scope.module } };
    case 'course':
      return { suffix: 'course', label: 'Увесь курс', whose: 'усього курсу', place: {} };
    case 'final':
      return { suffix: 'final', label: 'Підсумковий пул', whose: 'підсумкового пулу', place: {} };
  }
}

export function questionBankItem(course: Course, scope: XmlScope, produced: ProducedFile): DownloadItem {
  const { suffix, label, whose, place } = scoped(course, scope);
  return {
    id: `questions-training-${suffix}`,
    title: `Тренувальні питання. ${label}`,
    description: `Тренувальні питання ${whose} з поясненнями для імпорту в банк питань Moodle.`,
    kind: 'question-bank',
    format: 'xml',
    audience: 'teacher',
    ...place,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function glossaryItem(course: Course, scope: XmlScope, produced: ProducedFile): DownloadItem {
  const { suffix, label, whose, place } = scoped(course, scope);
  return {
    id: `glossary-${suffix}`,
    title: scope.kind === 'course' ? `Глосарій курсу «${course.title}»` : `Глосарій. ${label}`,
    description: `Терміни ${whose} з визначеннями для імпорту в глосарій Moodle.`,
    kind: 'glossary',
    format: 'xml',
    audience: 'teacher',
    ...place,
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export function syllabusItem(course: Course, produced: ProducedFile): DownloadItem {
  return {
    id: 'syllabus',
    title: `Силабус навчальної дисципліни «${course.title}»`,
    description: 'Що вивчає курс, як оцінюються роботи і які правила діють протягом семестру.',
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
    description: 'Робоча програма для погодження на кафедрі; поля, які треба уточнити, позначено примітками.',
    kind: 'work-program',
    format: 'docx',
    audience: 'teacher',
    path: sitePath(produced.file),
    bytes: produced.bytes,
  };
}

export const COURSE_BUNDLE_TITLE = 'Курс повністю';

export function moduleBundleTitle(course: Course, moduleId: string): string {
  return `Модуль ${moduleNumber(course, moduleId)} — усі матеріали`;
}

export function moduleBundleItem(course: Course, moduleId: string, produced: ProducedFile): DownloadItem {
  return {
    id: `bundle-${moduleId}`,
    title: moduleBundleTitle(course, moduleId),
    description: 'Усі матеріали модуля одним архівом.',
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
    description: 'Усі матеріали курсу одним архівом.',
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
    description: 'Готовий курс для відновлення в Moodle викладачем або адміністратором.',
    kind: 'backup',
    format: 'mbz',
    audience: 'teacher',
    url: release.url,
    bytes: release.bytes,
  };
}

const KIND_ORDER: readonly DownloadItem['kind'][] = ['syllabus', 'work-program', 'lecture', 'practical', 'book', 'question-bank', 'glossary', 'scorm', 'bundle', 'backup'];

/**
 * Сталий порядок маніфесту: документи курсу; далі модулі за порядком (матеріали за видом, у межах виду — спершу
 * файл модуля, потім файли тем; пакет модуля останнім); далі файли на весь курс; пакет курсу й резервна копія.
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
