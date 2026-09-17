/**
 * Режим вивантаження: які файли потраплять в архів, структура тек «Модуль 1/Тема 01/…» і README.txt.
 * Чисті функції; мережа й fflate — у zip-export.ts.
 */
import type { DownloadFormat } from '../../content/schemas/downloads';
import { visibleFiles, totalBytes } from './filter';
import { FILE_FORMS, TYPE_FORMS, formatBytes, formatLabel, kindLabel, pluralUk, twoDigits } from './texts';
import { MATERIAL_TYPES, type Audience, type Material, type MaterialFile, type MaterialType } from './types';

/** Файли матеріалу, які можна зібрати в браузері: файли сайту (не зовнішні) у вибраних форматах. */
export function downloadableFiles(material: Material, audience: Audience, formats: readonly DownloadFormat[]): MaterialFile[] {
  return visibleFiles(material, audience).filter((file) => !file.external && formats.includes(file.format));
}

const FORMAT_ORDER: readonly string[] = ['pdf', 'docx', 'pptx', 'xml', 'zip', 'mbz'];

function formatRank(format: DownloadFormat): number {
  const index = FORMAT_ORDER.indexOf(format);
  return index === -1 ? FORMAT_ORDER.length : index;
}

/** Формати, які є серед файлів сайту (для чипів форматів): документи, далі Moodle XML і архіви. */
export function availableFormats(materials: readonly Material[], audience: Audience): DownloadFormat[] {
  const formats = materials.flatMap((material) => visibleFiles(material, audience).filter((file) => !file.external).map((file) => file.format));
  return [...new Set(formats)].sort((a, b) => formatRank(a) - formatRank(b));
}

export function isSelectable(material: Material, audience: Audience): boolean {
  return visibleFiles(material, audience).some((file) => !file.external);
}

export interface SelectionSummary {
  readonly materials: readonly Material[];
  readonly files: readonly { readonly material: Material; readonly file: MaterialFile }[];
  readonly bytes: number;
}

export function summarizeSelection(
  materials: readonly Material[],
  selectedIds: readonly string[],
  audience: Audience,
  formats: readonly DownloadFormat[],
): SelectionSummary {
  const selected = materials.filter((material) => selectedIds.includes(material.id) && isSelectable(material, audience));
  const files = selected.flatMap((material) => downloadableFiles(material, audience, formats).map((file) => ({ material, file })));
  return { materials: selected, files, bytes: totalBytes(files.map((entry) => entry.file)) };
}

/** «3 лекції, 2 практичні, 1 тест · 9 файлів» */
export function selectionDetail(summary: SelectionSummary): string {
  const byType = MATERIAL_TYPES.flatMap((type: MaterialType) => {
    const count = summary.materials.filter((material) => material.type === type).length;
    return count > 0 ? [pluralUk(count, TYPE_FORMS[type])] : [];
  });
  const files = pluralUk(summary.files.length, FILE_FORMS);
  return byType.length > 0 ? `${byType.join(', ')} · ${files}` : files;
}

const FORBIDDEN_IN_NAMES = /[\\/:*?"<>|\x00-\x1f]/g;
const MAX_NAME_LENGTH = 90;

/** Назва файлу чи теки, безпечна для Windows, macOS і Linux; лапки «» і апостроф ’ лишаються. */
export function safeName(text: string): string {
  const cleaned = text.replace(FORBIDDEN_IN_NAMES, ' ').replace(/\s+/g, ' ').trim();
  const cut = cleaned.length > MAX_NAME_LENGTH ? `${cleaned.slice(0, MAX_NAME_LENGTH).trimEnd()}…` : cleaned;
  return cut.replace(/[. ]+$/, '') || 'файл';
}

export function folderOf(material: Material): string {
  const parts: string[] = [];
  if (material.moduleNumber) parts.push(`Модуль ${material.moduleNumber}`);
  else parts.push('Курс');
  if (material.practicalNumber) parts.push(`Практична ${twoDigits(material.practicalNumber)}`);
  else if (material.topicNumber) parts.push(`Тема ${twoDigits(material.topicNumber)}`);
  return parts.join('/');
}

export interface ArchiveEntry {
  readonly path: string;
  readonly material: Material;
  readonly file: MaterialFile;
}

/** Шляхи в архіві без збігів: однакові назви в одній теці отримують « (2)», « (3)». */
export function archiveEntries(summary: SelectionSummary): ArchiveEntry[] {
  const used = new Set<string>();
  return summary.files.map(({ material, file }) => {
    const folder = folderOf(material);
    const stem = safeName(file.title);
    let path = `${folder}/${stem}.${file.extension}`;
    for (let copy = 2; used.has(path.toLocaleLowerCase('uk-UA')); copy += 1) path = `${folder}/${stem} (${copy}).${file.extension}`;
    used.add(path.toLocaleLowerCase('uk-UA'));
    return { path, material, file };
  });
}

export const README_NAME = 'README.txt';

export interface ReadmeContext {
  readonly courseTitle: string;
  /** Сторінка кабінету, з якої зібрано архів (повна адреса). */
  readonly sourceUrl: string;
  readonly collectedAt: Date;
  readonly manifestGeneratedAt: string | null;
  /** Повна адреса файлу за відносною (location.href як база). */
  readonly absoluteUrl: (href: string) => string;
}

const kyivDateTime = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Kyiv',
});

/** README.txt з переліком файлів і джерелом; рядки CRLF, щоб текст читався і в Блокноті Windows. */
export function readmeText(entries: readonly ArchiveEntry[], context: ReadmeContext): string {
  const bytes = totalBytes(entries.map((entry) => entry.file));
  const header = [
    `${context.courseTitle} — матеріали курсу`,
    '',
    `Джерело: ${context.sourceUrl}`,
    `Зібрано: ${kyivDateTime.format(context.collectedAt)} (Київ)`,
    ...(context.manifestGeneratedAt ? [`Версія матеріалів: ${kyivDateTime.format(new Date(context.manifestGeneratedAt))}`] : []),
    `Склад: ${pluralUk(entries.length, FILE_FORMS)}, ${formatBytes(bytes)}`,
    '',
    'Теки: Модуль N / Тема NN або Практична NN; матеріали всього курсу — у теці «Курс».',
    'Moodle XML імпортується в банк питань, ZIP Книги — через «Імпорт глав», SCORM — як діяльність «Пакет SCORM».',
    'Покрокова інструкція для Moodle — на сторінці «Як завантажити курс у Moodle» на сайті курсу.',
    '',
    'Файли',
    '-----',
  ];
  const lines = entries.flatMap((entry) => [
    entry.path,
    `  ${entry.material.title}`,
    `  ${kindLabel(entry.file.kind)} · ${formatLabel(entry.file.format)} · ${formatBytes(entry.file.bytes)}`,
    `  ${context.absoluteUrl(entry.file.href)}`,
    '',
  ]);
  const footer = ['Зміст курсу — CC BY-NC-SA 4.0; назва й логотип університету — поза ліцензією.'];
  return [...header, ...lines, ...footer].join('\r\n');
}

/** «korporatyvne-upravlinnia-materialy-2026-09-17.zip» (латиницею: назву збережуть усі браузери й пошта). */
export function archiveFileName(collectedAt: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Kyiv' }).format(collectedAt);
  return `korporatyvne-upravlinnia-materialy-${parts}.zip`;
}
