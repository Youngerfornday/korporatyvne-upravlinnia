import type { Course } from '../../src/content/schemas/course.ts';
import type { DownloadItem } from '../../src/content/schemas/downloads.ts';
import { DOWNLOADS_DIR } from './downloads-items.ts';

/**
 * Пакети «Модуль N — усі матеріали» і «Курс повністю»: які файли входять і README.txt зі змістом і джерелом.
 * Архів має кореневу теку, щоб після розпакування файли не розсипалися по каталогу завантажень.
 */

export const REPOSITORY_URL = 'https://github.com/Youngerfornday/korporatyvne-upravlinnia';
const LICENSE_TEXT = 'Навчальний контент — CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/deed.uk); логотип університету — поза ліцензією.';
const MEGABYTE = 1024 * 1024;
const KILOBYTE = 1024;

const sizeFormat = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });

export function formatSize(bytes: number): string {
  if (bytes >= MEGABYTE) return `${sizeFormat.format(bytes / MEGABYTE)} МБ`;
  return `${sizeFormat.format(Math.max(1, Math.round(bytes / KILOBYTE)))} КБ`;
}

/** Файли пакета: матеріали модуля або, для курсу, усі файли сайту, крім інших пакетів. */
export function bundleMembers(items: readonly DownloadItem[], moduleId: string | undefined): DownloadItem[] {
  return items.filter((item) => item.path !== undefined && item.kind !== 'bundle' && (moduleId === undefined || item.module === moduleId));
}

/** Шлях файлу всередині архіву: без префікса `downloads/`. */
export function memberPath(item: DownloadItem): string {
  if (item.path === undefined) throw new Error(`Матеріал «${item.id}» не має файлу на сайті й не може увійти в пакет`);
  return item.path.slice(DOWNLOADS_DIR.length + 1);
}

export interface ReadmeInput {
  readonly course: Course;
  readonly title: string;
  readonly members: readonly DownloadItem[];
  readonly siteUrl: string;
  readonly generatedAt: Date;
  readonly backup: DownloadItem | undefined;
}

const MOODLE_HINTS: ReadonlyArray<readonly [DownloadItem['kind'], string]> = [
  ['question-bank', 'questions-*.xml — Банк питань → Імпорт → формат «Moodle XML».'],
  ['glossary', 'glossary-*.xml — модуль «Глосарій» → Імпорт записів (позначте «Імпортувати категорії»).'],
  ['book', 'book-*.zip — модуль «Книга» → Імпорт глав (ZIP).'],
];

export function readmeText(input: ReadmeInput): string {
  const { course, members } = input;
  const date = input.generatedAt.toISOString().slice(0, 10).split('-').reverse().join('.');
  const width = Math.max(...members.map((item) => memberPath(item).length));
  const contents = members.map((item) => `  ${memberPath(item).padEnd(width)}  ${item.title} (${formatSize(item.bytes)})`);
  const kinds = new Set(members.map((item) => item.kind));
  const hints = MOODLE_HINTS.filter(([kind]) => kinds.has(kind)).map(([, hint]) => `  ${hint}`);
  const backup = input.backup?.url === undefined ? [] : [`  Резервна копія всього курсу (.mbz, ${formatSize(input.backup.bytes)}): ${input.backup.url}`];
  const lines = [
    `${course.title} — ${input.title}`,
    course.institution,
    '',
    'Зміст архіву',
    ...contents,
    '',
    ...(hints.length + backup.length > 0 ? ['Як використати в Moodle', ...hints, ...backup, ''] : []),
    'Контрольні тести (модульні й підсумковий) сюди не входять: їхні банки зберігаються в приватному репозиторії.',
    '',
    'Джерело',
    `  Сайт курсу: ${input.siteUrl}`,
    `  Репозиторій: ${REPOSITORY_URL}`,
    `  Згенеровано ${date} з каталогу content/ командою npm run build:downloads.`,
    '',
    'Ліцензія',
    `  ${LICENSE_TEXT}`,
    '',
  ];
  return lines.join('\n');
}
