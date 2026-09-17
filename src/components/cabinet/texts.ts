/** Тексти й форматування кабінету (українська, без емодзі). Спільні для збирання сайту й острова. */
import type { DownloadFormat, DownloadKind } from '../../content/schemas/downloads';
import type { BloomLevel } from '../../content/schemas/questions';
import { pluralUk, type UkPluralForms } from '../../lib/plural';
import type { MaterialType } from './types';

const NBSP = '\u00A0';
const KIB = 1024;
const MIB = KIB * KIB;

export const TYPE_LABELS: Readonly<Record<MaterialType, string>> = {
  lecture: 'Лекція',
  practical: 'Практична',
  bank: 'Тест',
  glossary: 'Глосарій',
  document: 'Документ',
};

export const TYPE_ICONS: Readonly<Record<MaterialType, string>> = {
  lecture: 'book',
  practical: 'case',
  bank: 'list',
  glossary: 'cards',
  document: 'file',
};

/** Множина для підсумку вибору: «3 лекції, 2 практичні». */
export const TYPE_FORMS: Readonly<Record<MaterialType, UkPluralForms>> = {
  lecture: { one: 'лекція', few: 'лекції', many: 'лекцій', other: 'лекції' },
  practical: { one: 'практична', few: 'практичні', many: 'практичних', other: 'практичної' },
  bank: { one: 'тест', few: 'тести', many: 'тестів', other: 'тесту' },
  glossary: { one: 'глосарій', few: 'глосарії', many: 'глосаріїв', other: 'глосарію' },
  document: { one: 'документ', few: 'документи', many: 'документів', other: 'документа' },
};

/** Рівні Блума — як у тренувальному тесті (components/quiz/quiz-texts.ts), плюс скорочення для таблиці. */
export const BLOOM_TEXT: Readonly<Record<BloomLevel, { readonly label: string; readonly short: string }>> = {
  remember: { label: 'Запам’ятовування', short: 'Зап.' },
  understand: { label: 'Розуміння', short: 'Роз.' },
  apply: { label: 'Застосування', short: 'Заст.' },
  analyze: { label: 'Аналіз', short: 'Ан.' },
};

const FORMAT_LABELS: Partial<Record<DownloadFormat, string>> = {
  pdf: 'PDF',
  docx: 'DOCX',
  pptx: 'PPTX',
  xml: 'XML',
  zip: 'ZIP',
  mbz: 'MBZ',
};

/** Підписи форматів у панелі вивантаження: що саме потрапить в архів. */
const FORMAT_CHIP_LABELS: Partial<Record<DownloadFormat, string>> = {
  pdf: 'PDF',
  docx: 'DOCX',
  pptx: 'Презентації PPTX',
  xml: 'Moodle XML',
  zip: 'ZIP: Книга, SCORM',
  mbz: 'Резервна копія .mbz',
};

const KIND_LABELS: Partial<Record<DownloadKind, string>> = {
  lecture: 'Лекція',
  slides: 'Презентація',
  practical: 'Практична',
  syllabus: 'Силабус',
  'work-program': 'Робоча програма',
  glossary: 'Глосарій',
  'question-bank': 'Банк питань',
  book: 'Книга Moodle',
  scorm: 'SCORM 1.2',
  backup: 'Резервна копія Moodle',
  bundle: 'Пакет матеріалів',
};

/** Схема маніфесту може отримати нові види й формати: невідоме значення показуємо як є, а не ламаємо збірку. */
export function formatLabel(format: DownloadFormat): string {
  return FORMAT_LABELS[format] ?? format.toUpperCase();
}

export function formatChipLabel(format: DownloadFormat): string {
  return FORMAT_CHIP_LABELS[format] ?? formatLabel(format);
}

export function kindLabel(kind: DownloadKind): string {
  return KIND_LABELS[kind] ?? 'Файл';
}

const decimal = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });

/** «512 Б», «96 КБ», «1,4 МБ» (двійкові кратні, як показують файлові менеджери). */
export function formatBytes(bytes: number): string {
  if (bytes < KIB) return `${integer.format(bytes)}${NBSP}Б`;
  if (bytes < MIB) return `${integer.format(Math.max(1, Math.round(bytes / KIB)))}${NBSP}КБ`;
  return `${decimal.format(bytes / MIB)}${NBSP}МБ`;
}

export const MATERIAL_FORMS: UkPluralForms = { one: 'матеріал', few: 'матеріали', many: 'матеріалів', other: 'матеріалу' };
export const FILE_FORMS: UkPluralForms = { one: 'файл', few: 'файли', many: 'файлів', other: 'файлу' };
export const QUESTION_FORMS: UkPluralForms = { one: 'питання', few: 'питання', many: 'питань', other: 'питання' };
export const TERM_FORMS: UkPluralForms = { one: 'термін', few: 'терміни', many: 'термінів', other: 'терміна' };
export const TOPIC_FORMS: UkPluralForms = { one: 'тема', few: 'теми', many: 'тем', other: 'теми' };

/** «Вибрано 7 матеріалів · 6,6 МБ» */
export function selectionLine(materials: number, bytes: number): string {
  return `Вибрано ${pluralUk(materials, MATERIAL_FORMS)} · ${formatBytes(bytes)}`;
}

/** Двозначний номер для тек архіву й коротких позначок: 1 → «01». */
export function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export { pluralUk };
