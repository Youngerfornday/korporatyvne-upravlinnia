/** Фільтри, лічильники й сортування матеріалів кабінету. Чисті функції: стан живе в острові. */
import type { BloomLevel } from '../../content/schemas/questions';
import { matchesQuery } from './search';
import { MATERIAL_TYPES, type Audience, type Material, type MaterialFile, type MaterialType } from './types';

export interface MaterialFilters {
  readonly moduleId: string;
  /** Порожній список — усі типи. */
  readonly types: readonly MaterialType[];
  readonly bloom: BloomLevel | '';
  readonly query: string;
}

export const EMPTY_FILTERS: MaterialFilters = { moduleId: '', types: [], bloom: '', query: '' };

export type SortKey = 'order' | 'title' | 'type' | 'topic' | 'size' | 'updated';
export type SortDirection = 'ascending' | 'descending';

export interface SortState {
  readonly key: SortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { key: 'order', direction: 'ascending' };

/** Вид студента не бачить файлів для викладача (пакети Moodle з ключами тестів). */
export function visibleFiles(material: Material, audience: Audience): readonly MaterialFile[] {
  return audience === 'teacher' ? material.files : material.files.filter((file) => file.audience === 'student');
}

export function totalBytes(files: readonly MaterialFile[]): number {
  return files.reduce((sum, file) => sum + file.bytes, 0);
}

function matchesExceptType(material: Material, filters: MaterialFilters): boolean {
  if (filters.moduleId !== '' && material.moduleId !== filters.moduleId) return false;
  if (filters.bloom !== '' && (material.bloom?.[filters.bloom] ?? 0) === 0) return false;
  return matchesQuery(material.searchText, filters.query);
}

export function filterMaterials(materials: readonly Material[], filters: MaterialFilters): Material[] {
  return materials.filter(
    (material) => matchesExceptType(material, filters) && (filters.types.length === 0 || filters.types.includes(material.type)),
  );
}

/** Лічильник на чипі типу враховує всі інші фільтри, крім самого типу (як у фасетному пошуку). */
export function countByType(materials: readonly Material[], filters: MaterialFilters): Record<MaterialType, number> {
  const matching = materials.filter((material) => matchesExceptType(material, filters));
  return Object.fromEntries(MATERIAL_TYPES.map((type) => [type, matching.filter((m) => m.type === type).length])) as Record<
    MaterialType,
    number
  >;
}

function compareBy(key: SortKey, audience: Audience): (a: Material, b: Material) => number {
  switch (key) {
    case 'title':
      return (a, b) => a.title.localeCompare(b.title, 'uk');
    case 'type':
      return (a, b) => MATERIAL_TYPES.indexOf(a.type) - MATERIAL_TYPES.indexOf(b.type);
    case 'topic':
      return (a, b) => (a.topicNumber ?? 0) - (b.topicNumber ?? 0);
    case 'size':
      return (a, b) => totalBytes(visibleFiles(a, audience)) - totalBytes(visibleFiles(b, audience));
    case 'updated':
      return (a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
    default:
      return () => 0;
  }
}

/** Стабільне сортування; за рівних значень — порядок курсу. */
export function sortMaterials(materials: readonly Material[], sort: SortState, audience: Audience): Material[] {
  const compare = compareBy(sort.key, audience);
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return [...materials].sort((a, b) => sign * compare(a, b) || a.order - b.order);
}

/** Клік по заголовку: новий стовпець — за зростанням, той самий — змінює напрям. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, direction: 'ascending' };
  return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
}
