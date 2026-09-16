import { typoPlain } from './text.ts';

/**
 * Частина course.yaml, потрібна експортерам: модулі й теми в порядку реєстру. Описана окремими типами,
 * а не через `Pick<Course, …>`, щоб нові поля тем (результати навчання, години, кейси) не тягли за собою
 * зміни фікстур експорту; об’єкт `Course` підходить структурно.
 */
export interface RegistryModule {
  readonly id: string;
  readonly title: string;
}

export interface RegistryTopic {
  readonly id: string;
  readonly module: string;
  readonly title: string;
  readonly summary: string;
}

/** Реєстр термінів глосарію з course.yaml: дає назву терміна навіть тоді, коли його теми немає у вивантаженні. */
export interface RegistryGlossaryTerm {
  readonly id: string;
  readonly term: string;
}

export interface CourseRegistry {
  readonly modules: readonly RegistryModule[];
  readonly topics: readonly RegistryTopic[];
  readonly glossaryTerms?: readonly RegistryGlossaryTerm[];
}

/** Помилка вхідних даних експорту: усі знайдені проблеми українською. */
export class ExportError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Експорт неможливий:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ExportError';
    this.problems = problems;
  }
}

export function throwIfProblems(problems: readonly string[]): void {
  if (problems.length > 0) throw new ExportError(problems);
}

export interface TopicPlace {
  readonly module: RegistryModule;
  readonly topic: RegistryTopic;
  /** Позиція теми в реєстрі — ключ стабільного сортування. */
  readonly order: number;
}

export function indexTopics(course: CourseRegistry): ReadonlyMap<string, TopicPlace> {
  const modules = new Map(course.modules.map((module) => [module.id, module]));
  return new Map(
    course.topics.flatMap((topic, order) => {
      const module = modules.get(topic.module);
      return module ? [[topic.id, { module, topic, order }] as const] : [];
    }),
  );
}

export function moduleOrder(course: CourseRegistry, moduleId: string): number {
  return course.modules.findIndex((module) => module.id === moduleId);
}

/** У шляху категорії Moodle `/` — роздільник; буквальна скісна риска в назві подвоюється. */
function escapeCategoryName(name: string): string {
  return name.replace(/\//g, '//');
}

export function moduleCategoryName(module: RegistryModule): string {
  return typoPlain(`Модуль ${module.id.slice(1)}. ${module.title}`);
}

export function topicCategoryName(topic: RegistryTopic): string {
  return typoPlain(`Тема ${topic.id.slice(1)}. ${topic.title}`);
}

export function moduleCategoryPath(module: RegistryModule): string {
  return `top/${escapeCategoryName(moduleCategoryName(module))}`;
}

export function topicCategoryPath(module: RegistryModule, topic: RegistryTopic): string {
  return `${moduleCategoryPath(module)}/${escapeCategoryName(topicCategoryName(topic))}`;
}
