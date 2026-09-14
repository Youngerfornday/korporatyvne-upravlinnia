import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CourseSchema } from './course';

const COURSE_FILE = new URL('../../../content/course.yaml', import.meta.url);

function loadCourseYaml(): Record<string, unknown> {
  return parse(readFileSync(COURSE_FILE, 'utf8')) as Record<string, unknown>;
}

function issuesOf(input: unknown): string[] {
  const result = CourseSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

type Course = ReturnType<typeof loadCourseYaml> & {
  topics: Array<Record<string, unknown>>;
  modules: Array<Record<string, unknown>>;
  glossaryTerms: Array<Record<string, unknown>>;
  learningOutcomes: Array<Record<string, unknown>>;
  grading: { split: Record<string, number>; categories: Array<Record<string, unknown>> };
  scale: Array<Record<string, unknown>>;
};

const course = () => loadCourseYaml() as Course;

describe('content/course.yaml', () => {
  it('is valid against CourseSchema', () => {
    expect(issuesOf(course())).toEqual([]);
  });

  it('seeds 4 modules with 3 topics each and the agreed hours', () => {
    // Act
    const parsed = CourseSchema.parse(course());

    // Assert
    expect(parsed.modules.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(parsed.topics.map((t) => t.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `t${String(i + 1).padStart(2, '0')}`),
    );
    expect(parsed.hours).toEqual({ total: 120, lectures: 32, practicals: 16, selfStudy: 72 });
    expect(parsed.grading.categories.map((c) => c.items * c.pointsPerItem)).toEqual([24, 24, 12, 40]);
  });
});

describe('CourseSchema: registry integrity', () => {
  it('rejects duplicate topic ids and slugs', () => {
    const data = course();
    const duplicate = { ...data, topics: [...data.topics, { ...data.topics[0] }] };
    const issues = issuesOf(duplicate);
    expect(issues).toContainEqual(expect.stringMatching(/t01/));
    expect(issues).toContainEqual(expect.stringMatching(/slug/));
  });

  it('rejects a glossary term registered twice, even under different modules', () => {
    const data = course();
    const duplicate = { ...data, glossaryTerms: [...data.glossaryTerms, { id: 'agency-problem', topic: 't10' }] };
    expect(issuesOf(duplicate)).toContainEqual(expect.stringMatching(/agency-problem/));
  });

  it('rejects duplicate module and learning outcome ids', () => {
    const data = course();
    expect(issuesOf({ ...data, modules: [...data.modules, { id: 'm1', title: 'Копія' }] })).toContainEqual(
      expect.stringMatching(/m1/),
    );
    expect(issuesOf({ ...data, learningOutcomes: [...data.learningOutcomes, { id: 'prn01' }] })).toContainEqual(
      expect.stringMatching(/prn01/),
    );
  });

  it('rejects references to modules, topics and outcomes that are not registered', () => {
    const data = course();
    const badTopic = { ...data, topics: data.topics.map((t, i) => (i === 0 ? { ...t, module: 'm9' } : t)) };
    const badTerm = { ...data, glossaryTerms: [{ id: 'orphan', topic: 't99' }] };
    const badOutcome = { ...data, learningOutcomes: [{ id: 'prn01', topics: ['t42'] }] };
    expect(issuesOf(badTopic)).toContainEqual(expect.stringMatching(/m9/));
    expect(issuesOf(badTerm)).toContainEqual(expect.stringMatching(/t99/));
    expect(issuesOf(badOutcome)).toContainEqual(expect.stringMatching(/t42/));
  });

  it('rejects a module without topics', () => {
    const data = course();
    const empty = { ...data, modules: [...data.modules, { id: 'm5', title: 'Порожній' }] };
    expect(issuesOf(empty)).toContainEqual(expect.stringMatching(/m5/));
  });
});

describe('CourseSchema: hours, grading and scale', () => {
  it('rejects hours that do not add up or do not match the credits', () => {
    const data = course();
    expect(issuesOf({ ...data, hours: { total: 120, lectures: 30, practicals: 16, selfStudy: 72 } })).toContainEqual(
      expect.stringMatching(/годин/),
    );
    expect(issuesOf({ ...data, credits: 3 })).toContainEqual(expect.stringMatching(/кредит/));
  });

  it('rejects grading that does not total 100 or breaks the current/final split', () => {
    const data = course();
    const categories = data.grading.categories.map((c) => (c['id'] === 'case-project' ? { ...c, pointsPerItem: 10 } : c));
    const issues = issuesOf({ ...data, grading: { ...data.grading, categories } });
    expect(issues).toContainEqual(expect.stringMatching(/current/));
  });

  it('rejects a scale with a gap or an overlap', () => {
    const data = course();
    const gap = data.scale.map((band) => (band['ects'] === 'B' ? { ...band, min: 83 } : band));
    const overlap = data.scale.map((band) => (band['ects'] === 'C' ? { ...band, max: 85 } : band));
    expect(issuesOf({ ...data, scale: gap })).toContainEqual(expect.stringMatching(/шкал/i));
    expect(issuesOf({ ...data, scale: overlap })).toContainEqual(expect.stringMatching(/шкал/i));
  });

  it('allows the teacher placeholder but rejects an invalid e-mail when real data is added', () => {
    const data = course();
    expect(issuesOf({ ...data, teacher: { isPlaceholder: false, name: 'Ім’я', email: 'not-an-email' } }).length).toBeGreaterThan(0);
  });
});
