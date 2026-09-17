/**
 * Навігація сайту. Розділи без сторінки показуються як «незабаром», а не як биті посилання.
 * `teacher` — сторінки для викладача (кабінет, інструкція Moodle): пункту меню немає, у шапці активний вид «Викладач».
 */
export type NavId = 'course' | 'topics' | 'tests' | 'trainers' | 'cards' | 'teacher';

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
  { id: 'trainers', label: 'Тренажери', path: 'trenazhery/' },
  { id: 'cards', label: 'Картки' },
];

/** Кабінет викладача: матеріали, матриця ПРН × теми, режим вивантаження. */
export const CABINET_PATH = 'kabinet/';

/** Оглядач тренувального банку теми в кабінеті: `kabinet/bank/<slug>/`. */
export function bankBrowserPath(slug: string): string {
  return `${CABINET_PATH}bank/${slug}/`;
}

/** Покрокова інструкція «Як завантажити курс у Moodle». */
export const MOODLE_GUIDE_PATH = 'moodle/';

/** Ключ localStorage для виду кабінету (Студент / Викладач). */
export const VIEW_STORAGE_KEY = 'ku:v1:view';

/** Профіль гравця: рівень, XP, бейджі, карта проходження, код прогресу. */
export const PROFILE_PATH = 'profil/';

/** Тренувальний тест теми: `testy/<slug>/`. */
export function quizPath(slug: string): string {
  return `testy/${slug}/`;
}

/** Ключ localStorage для теми (спільний префікс сховища прогресу ku:v1:). */
export const THEME_STORAGE_KEY = 'ku:v1:theme';
