import { describe, expect, it } from 'vitest';
import { CourseSchema, type Course } from '../../content/schemas/course';
import { loadCourse } from '../../content/schemas/__fixtures__/course';
import { buildOutcomeMatrix, coveredTopics, outcomesPerTopic, viewMatrix } from './matrix';

const course: Course = CourseSchema.parse(loadCourse());
const matrix = buildOutcomeMatrix(course, new Set(['t01']));

function row(id: string) {
  const found = matrix.rows.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Немає ПРН ${id}`);
  return found;
}

function topicIndex(id: string): number {
  return matrix.topics.findIndex((topic) => topic.id === id);
}

describe('buildOutcomeMatrix', () => {
  it('рядок на кожен ПРН, стовпець на кожну тему; опубліковані теми позначені', () => {
    expect(matrix.rows).toHaveLength(course.learningOutcomes.length);
    expect(matrix.topics).toHaveLength(course.topics.length);
    expect(matrix.topics[0]).toMatchObject({ id: 't01', number: 1, published: true });
    expect(matrix.topics[1]?.published).toBe(false);
    expect(matrix.rows.every((r) => r.cells.length === course.topics.length)).toBe(true);
  });

  it('покриття відповідає course.yaml: лекція, практична, обидва, немає', () => {
    for (const outcome of course.learningOutcomes) {
      const cells = row(outcome.id).cells;
      course.topics.forEach((topic, index) => {
        const lecture = outcome.topics.includes(topic.id);
        const practical = course.practicals.some((p) => outcome.practicals.includes(p.id) && p.topics.includes(topic.id));
        const expected = lecture && practical ? 'both' : lecture ? 'lecture' : practical ? 'practical' : 'none';
        expect(cells[index], `${outcome.code} × ${topic.id}`).toBe(expected);
      });
    }
  });

  it('ПРН3 покривається темою 1 і лекцією, і практичною 1', () => {
    expect(row('prn03').cells[topicIndex('t01')]).toBe('both');
    expect(row('prn03').practicals.map((p) => p.number)).toContain(1);
  });
});

describe('viewMatrix', () => {
  it('без фільтрів — усі теми й ПРН, що мають покриття', () => {
    const view = viewMatrix(matrix, '', '');
    expect(view.topicIndexes).toHaveLength(course.topics.length);
    expect(view.rows).toHaveLength(course.learningOutcomes.length);
  });

  it('фільтр модуля лишає теми модуля й лише ПРН з покриттям у них', () => {
    const view = viewMatrix(matrix, 'm1', '');
    const m1Topics = course.topics.filter((t) => t.module === 'm1').length;
    expect(view.topicIndexes).toHaveLength(m1Topics);
    for (const r of view.rows) expect(coveredTopics(r, view.topicIndexes)).toBeGreaterThan(0);
  });

  it('пошук за кодом «ПРН 12» і за словом формулювання', () => {
    expect(viewMatrix(matrix, '', 'прн 12').rows.map((r) => r.id)).toEqual(['prn12']);
    expect(viewMatrix(matrix, '', 'соціально відповідально').rows.map((r) => r.id)).toEqual(['prn15']);
  });

  it('підсумки: теми на ПРН і ПРН на тему', () => {
    const view = viewMatrix(matrix, '', '');
    const outcome = course.learningOutcomes.find((o) => o.id === 'prn11');
    expect(coveredTopics(row('prn11'), view.topicIndexes)).toBeGreaterThanOrEqual(outcome?.topics.length ?? 0);
    expect(outcomesPerTopic(matrix.rows, topicIndex('t01'))).toBe(
      course.learningOutcomes.filter((o) => row(o.id).cells[topicIndex('t01')] !== 'none').length,
    );
  });
});
