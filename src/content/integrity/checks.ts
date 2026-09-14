import type { Course } from '../schemas/course';
import type { GlossaryFile } from '../schemas/glossary';
import { findDuplicates, normalizeText } from '../schemas/primitives';
import type { BankFile } from '../schemas/questions';
import type { SourcesFile } from '../schemas/sources';
import type { TopicFrontmatter } from '../schemas/topic';

/**
 * Перевірки, яких не бачить схема окремого файлу: дублікати між модулями й відповідність реєстру course.yaml.
 * Чисті функції — викликаються з content-loader під час збірки і з тестів.
 */
export interface ContentIssue {
  readonly file: string;
  readonly message: string;
}

export interface ContentEntry<T> {
  readonly filePath: string;
  readonly data: T;
}

const TOPIC_FOLDER = /(?:^|\/)modules\/(m\d+)\/(t\d{2})\//;
const BANK_FILE = /(?:^|\/)banks\/(training|control)\/([^/]+)\.yaml$/;

interface RegistryIndex {
  readonly topicModule: ReadonlyMap<string, string>;
  readonly termTopic: ReadonlyMap<string, string>;
  readonly outcomes: ReadonlySet<string>;
}

function indexRegistry(course: Course): RegistryIndex {
  return {
    topicModule: new Map(course.topics.map((topic) => [topic.id, topic.module])),
    termTopic: new Map(course.glossaryTerms.map((term) => [term.id, term.topic])),
    outcomes: new Set(course.learningOutcomes.map((outcome) => outcome.id)),
  };
}

/** Порівнює тему у файлі з каталогом `modules/mN/tNN/` і з модулем теми в реєстрі. */
function checkTopicFolder(filePath: string, topic: string, registry: RegistryIndex): string[] {
  const module = registry.topicModule.get(topic);
  if (module === undefined) return [`Тему «${topic}» не зареєстровано в course.yaml`];
  const folder = TOPIC_FOLDER.exec(filePath);
  if (!folder || folder[1] !== module || folder[2] !== topic) {
    return [`Файл теми «${topic}» має лежати в modules/${module}/${topic}/, а лежить у ${folder ? `${folder[1]}/${folder[2]}` : 'іншому місці'}`];
  }
  return [];
}

function duplicateIssues(items: ReadonlyArray<{ file: string; key: string }>, label: string, display = (key: string) => key): ContentIssue[] {
  const duplicates = new Set(findDuplicates(items.map((item) => item.key)));
  return [...duplicates].map((key) => ({
    file: items.filter((item) => item.key === key).map((item) => item.file).join(', '),
    message: `Дублікат ${label} «${display(key)}»`,
  }));
}

export function checkTopics(entries: ReadonlyArray<ContentEntry<TopicFrontmatter>>, course: Course): ContentIssue[] {
  const registry = indexRegistry(course);
  const perFile = entries.flatMap(({ filePath, data }) => {
    const messages = [
      ...checkTopicFolder(filePath, data.id, registry),
      ...data.keyTerms.filter((term) => !registry.termTopic.has(term)).map((term) => `Ключовий термін «${term}» не зареєстровано`),
      ...data.learningOutcomes.filter((id) => !registry.outcomes.has(id)).map((id) => `ПРН «${id}» не зареєстровано`),
    ];
    return messages.map((message) => ({ file: filePath, message }));
  });
  const duplicates = duplicateIssues(entries.map((e) => ({ file: e.filePath, key: e.data.id })), 'ID теми');
  return [...perFile, ...duplicates];
}

export function checkGlossaries(entries: ReadonlyArray<ContentEntry<GlossaryFile>>, course: Course): ContentIssue[] {
  const registry = indexRegistry(course);
  const perFile = entries.flatMap(({ filePath, data }) => {
    const messages = [
      ...checkTopicFolder(filePath, data.topic, registry),
      ...data.terms.flatMap((term) => {
        const registeredTopic = registry.termTopic.get(term.id);
        if (registeredTopic === undefined) return [`Термін «${term.id}» не зареєстровано в course.yaml`];
        if (registeredTopic !== data.topic) return [`Термін «${term.id}» зареєстровано за темою ${registeredTopic}, а визначено в ${data.topic}`];
        return [];
      }),
      ...data.terms.flatMap((term) =>
        term.seeAlso
          .filter((target) => !registry.termTopic.has(target))
          .map((target) => `Термін «${term.id}» посилається в seeAlso на незареєстрований термін «${target}»`),
      ),
    ];
    return messages.map((message) => ({ file: filePath, message }));
  });

  const terms = entries.flatMap(({ filePath, data }) => data.terms.map((term) => ({ file: filePath, term })));
  const labels = new Map([...terms].reverse().map(({ term }) => [normalizeText(term.term), term.term]));
  return [
    ...perFile,
    ...duplicateIssues(terms.map(({ file, term }) => ({ file, key: term.id })), 'ID терміна'),
    ...duplicateIssues(
      terms.map(({ file, term }) => ({ file, key: normalizeText(term.term) })),
      'назви терміна',
      (key) => labels.get(key) ?? key,
    ),
  ];
}

export function checkSources(entries: ReadonlyArray<ContentEntry<SourcesFile>>, course: Course): ContentIssue[] {
  const registry = indexRegistry(course);
  return entries.flatMap(({ filePath, data }) =>
    checkTopicFolder(filePath, data.topic, registry).map((message) => ({ file: filePath, message })),
  );
}

/** Публічна колекція банків: лише тренувальні, файл `training/mN.yaml`, питання — з тем цього модуля. */
export function checkBanks(entries: ReadonlyArray<ContentEntry<BankFile>>, course: Course): ContentIssue[] {
  const registry = indexRegistry(course);
  const perFile = entries.flatMap(({ filePath, data }) => {
    const location = BANK_FILE.exec(filePath);
    const messages = [
      ...(data.kind === 'control' || location?.[1] === 'control'
        ? ['Контрольний банк не може бути в публічному репозиторії']
        : []),
      ...(location?.[2] === data.module ? [] : [`Банк модуля ${data.module} має називатися training/${data.module}.yaml, а не ${filePath.split('/').pop()}`]),
      ...data.questions.flatMap((question) => {
        const module = registry.topicModule.get(question.topic);
        if (module === undefined) return [`Питання «${question.id}»: тему «${question.topic}» не зареєстровано`];
        if (module !== data.module) return [`Питання «${question.id}» належить модулю ${module}, а банк — модулю ${data.module}`];
        return [];
      }),
    ];
    return messages.map((message) => ({ file: filePath, message }));
  });
  const questions = entries.flatMap(({ filePath, data }) => data.questions.map((q) => ({ file: filePath, key: q.id })));
  return [...perFile, ...duplicateIssues(questions, 'ID питання')];
}

export function formatIssues(collection: string, issues: readonly ContentIssue[]): string {
  const lines = issues.map((issue) => `  - ${issue.file}: ${issue.message}`);
  return [`Перевірка цілісності колекції «${collection}» не пройдена (${issues.length}):`, ...lines].join('\n');
}
