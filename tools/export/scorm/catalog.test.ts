import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { CALCULATOR_TRAINERS, MATRIX_TRAINER } from '../../../src/components/trainers/catalog.ts';
import { CourseSchema, type Course } from '../../../src/content/schemas/course.ts';
import type { PracticalFile } from '../../../src/content/schemas/practical.ts';
import { loadPracticals, parseDataFile } from '../downloads-sources.ts';
import { CALCULATOR_MASTERY_PERCENT, matrixCriterion, scormPackageSpecs } from './catalog.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
let course: Course;
let practicals: PracticalFile[];

beforeAll(async () => {
  course = await parseDataFile(join(ROOT, 'content/course.yaml'), CourseSchema);
  practicals = await loadPracticals(join(ROOT, 'content/practicals'), course);
});

describe('scormPackageSpecs on the real course', () => {
  test('packages the P1 matrix and the three calculator trainers in practical order', () => {
    // Act
    const specs = scormPackageSpecs(course, practicals);

    // Assert
    expect(specs.map((spec) => [spec.id, spec.kind, spec.practicalId])).toEqual([
      ['p01-matrytsia-modelei', 'matrix', 'p01'],
      ['p03-kvorum', 'quorum', 'p03'],
      ['p03-kumuliatyvne-holosuvannia', 'cumulative', 'p03'],
      ['p05-dyvidendy', 'dividends', 'p05'],
    ]);
  });

  test('uses the same activity IDs as the site, so progress events match', () => {
    // Act
    const specs = scormPackageSpecs(course, practicals);

    // Assert
    expect(specs[0]?.data.activityId).toBe(MATRIX_TRAINER.activityId);
    expect(specs.slice(1).map((spec) => spec.data.activityId)).toEqual(CALCULATOR_TRAINERS.map((trainer) => trainer.activityId));
  });

  test('takes the matrix pass mark from the top rubric band and 100 for calculators', () => {
    // Act
    const [matrix, ...calculators] = scormPackageSpecs(course, practicals);

    // Assert
    expect(matrix?.masteryPercent).toBe(90);
    expect(matrix?.data.masteryPercent).toBe(90);
    for (const spec of calculators) expect(spec.masteryPercent).toBe(CALCULATOR_MASTERY_PERCENT);
  });

  test('ships the matrix with typography, all cells, sources and company tasks', () => {
    // Act
    const [matrix] = scormPackageSpecs(course, practicals);
    const file = practicals.find((candidate) => candidate.id === 'p01');

    // Assert
    expect(matrix?.data.kind).toBe('matrix');
    if (matrix?.data.kind !== 'matrix' || !file) return;
    expect(matrix.data.matrix.features).toHaveLength(file.trainer.features.length);
    expect(Object.keys(matrix.data.sources)).toEqual(file.sources.map((source) => source.id));
    expect(matrix.data.companyTasks).toHaveLength(file.trainer.companyTasks.length);
    expect(matrix.title.replace(/\s/g, ' ')).toBe('П1. Матриця моделей корпоративного управління');
    expect(matrix.module).toBe('m1');
  });
});

describe('matrixCriterion', () => {
  test('fails with an explanation when no rubric criterion has percent thresholds', () => {
    // Arrange
    const practical = course.practicals.find((candidate) => candidate.id === 'p03');
    if (!practical) throw new Error('немає p03');

    // Act and Assert
    expect(() => matrixCriterion(practical)).toThrow(/немає критерію з порогами/);
  });
});
