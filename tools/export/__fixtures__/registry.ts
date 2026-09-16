import type { CourseRegistry } from '../registry.ts';

/** Стабільний реєстр для снапшотів (незалежний від content/course.yaml, який редагує методист). */
export const REGISTRY: CourseRegistry = {
  modules: [
    { id: 'm1', title: 'Основи корпоративного управління' },
    { id: 'm2', title: 'Органи корпоративного управління' },
    { id: 'm3', title: 'Капітал / ринок' },
  ],
  topics: [
    { id: 't01', module: 'm1', title: 'Корпорація', summary: 'Власність і контроль.' },
    { id: 't02', module: 'm1', title: 'Моделі КУ', summary: 'Моделі й стандарти.' },
    { id: 't04', module: 'm2', title: 'Акціонери та загальні збори', summary: 'Кворум і голосування.' },
    { id: 't05', module: 'm2', title: 'Наглядова рада', summary: 'Комітети ради.' },
    { id: 't07', module: 'm3', title: 'Капітал і дивіденди', summary: 'Розрахунок дивідендів.' },
  ],
};
