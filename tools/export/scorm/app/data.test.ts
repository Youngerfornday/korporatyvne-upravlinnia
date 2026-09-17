import { describe, expect, test } from 'vitest';
import { packageDataScript, parsePackageData, type ScormPackageData } from './data.ts';

const CALCULATOR: ScormPackageData = { kind: 'quorum', activityId: 'quorum-calculator', masteryPercent: 100 };

describe('packageDataScript', () => {
  test('escapes < so content cannot close the script element', () => {
    // Arrange
    const data = { ...CALCULATOR, activityId: '</script><script>alert(1)</script>' };

    // Act
    const script = packageDataScript(data);

    // Assert
    expect(script).not.toContain('<');
    expect(JSON.parse(script)).toEqual(data);
  });
});

describe('parsePackageData', () => {
  test('returns data of the expected kind', () => {
    expect(parsePackageData(packageDataScript(CALCULATOR), 'quorum')).toEqual(CALCULATOR);
  });

  test.each([
    ['not json', null, /коректного JSON/],
    ['wrong kind', packageDataScript(CALCULATOR), /не належать тренажеру «dividends»/],
    ['no mastery', JSON.stringify({ kind: 'dividends', activityId: 'x' }), /прохідного бала/],
    ['mastery out of range', JSON.stringify({ kind: 'dividends', activityId: 'x', masteryPercent: 140 }), /прохідного бала/],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parsePackageData(text, 'dividends')).toThrow(message);
  });

  test('requires matrix, rubric, sources and company tasks for the matrix package', () => {
    // Arrange
    const incomplete = JSON.stringify({ kind: 'matrix', activityId: 'p01-model-matrix', masteryPercent: 90, matrix: {} });

    // Act and Assert
    expect(() => parsePackageData(incomplete, 'matrix')).toThrow(/матриці, рубрики чи джерел/);
  });
});
