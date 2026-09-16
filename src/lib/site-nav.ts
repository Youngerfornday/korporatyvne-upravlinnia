/** Навігація сайту. Розділи без сторінки показуються як «незабаром», а не як биті посилання. */
export type NavId = 'course' | 'topics' | 'tests' | 'trainers' | 'cards';

export interface NavItem {
  readonly id: NavId;
  readonly label: string;
  /** Внутрішній шлях для url(); відсутній — розділ ще не опубліковано. */
  readonly path?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'course', label: 'Курс', path: '' },
  { id: 'topics', label: 'Теми', path: 'temy/' },
  { id: 'tests', label: 'Тести', path: 'testy/' },
  { id: 'trainers', label: 'Тренажери' },
  { id: 'cards', label: 'Картки' },
];

/** Кабінет викладача робить інший агент; шлях зафіксовано планом. */
export const CABINET_PATH = 'kabinet/';

/** Профіль гравця: рівень, XP, бейджі, карта проходження, код прогресу. */
export const PROFILE_PATH = 'profil/';

/** Тренувальний тест теми: `testy/<slug>/`. */
export function quizPath(slug: string): string {
  return `testy/${slug}/`;
}

/** Ключ localStorage для теми (спільний префікс сховища прогресу ku:v1:). */
export const THEME_STORAGE_KEY = 'ku:v1:theme';
