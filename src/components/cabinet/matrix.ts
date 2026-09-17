/**
 * Матриця ПРН × теми з course.yaml: тема покриває ПРН лекцією (ПРН → topics) і/або практичною
 * (ПРН → practicals, а практична пов’язана з темою). Узгодженість цих списків перевіряє схема курсу.
 */
import type { Course } from '../../content/schemas/course';
import { matchesQuery, normalizeSearch } from './search';
import type { Coverage, MatrixRow, MatrixTopic, OutcomeMatrix } from './types';

export function buildOutcomeMatrix(course: Course, publishedTopicIds: ReadonlySet<string>): OutcomeMatrix {
  const topics: MatrixTopic[] = course.topics.map((topic, index) => ({
    id: topic.id,
    number: index + 1,
    moduleId: topic.module,
    title: topic.title,
    published: publishedTopicIds.has(topic.id),
  }));
  const practicalNumber = new Map(course.practicals.map((practical, index) => [practical.id, index + 1]));

  const rows: MatrixRow[] = course.learningOutcomes.map((outcome) => {
    const practicals = course.practicals.filter((practical) => outcome.practicals.includes(practical.id));
    const cells = topics.map((topic): Coverage => {
      const lecture = outcome.topics.includes(topic.id);
      const practical = practicals.some((p) => p.topics.includes(topic.id));
      if (lecture && practical) return 'both';
      if (lecture) return 'lecture';
      return practical ? 'practical' : 'none';
    });
    return {
      id: outcome.id,
      code: outcome.code,
      statement: outcome.statement,
      cells,
      practicals: practicals.map((p) => ({ id: p.id, number: practicalNumber.get(p.id) ?? 0, moduleId: p.module })),
    };
  });
  return { topics, rows };
}

export interface MatrixView {
  readonly topicIndexes: readonly number[];
  readonly rows: readonly MatrixRow[];
}

/** Фільтр модуля лишає його теми й ПРН, які ці теми покривають; пошук — за кодом і формулюванням ПРН. */
export function viewMatrix(matrix: OutcomeMatrix, moduleId: string, query: string): MatrixView {
  const topicIndexes = matrix.topics.flatMap((topic, index) => (moduleId === '' || topic.moduleId === moduleId ? [index] : []));
  const rows = matrix.rows.filter(
    (row) =>
      topicIndexes.some((index) => row.cells[index] !== 'none') &&
      matchesQuery(normalizeSearch(`${row.code} ${row.code.replace(/(\D)(\d)/, '$1 $2')} ${row.statement}`), query),
  );
  return { topicIndexes, rows };
}

export function coveredTopics(row: MatrixRow, topicIndexes: readonly number[]): number {
  return topicIndexes.filter((index) => row.cells[index] !== 'none').length;
}

export function outcomesPerTopic(rows: readonly MatrixRow[], topicIndex: number): number {
  return rows.filter((row) => row.cells[topicIndex] !== 'none').length;
}
