import { describe, expect, it } from 'vitest';
import { at, byId, issuesOf, loadCourse, mutated } from './__fixtures__/course';
import { CourseSchema } from './course';
import { BloomLevelSchema } from './questions';

describe('course.yaml: assessment data', () => {
  it('balances module tests 5/5/4/1 out of 15 questions in 30 minutes with one attempt', () => {
    const { moduleTests } = CourseSchema.parse(loadCourse()).grading;
    expect(moduleTests).toMatchObject({ questions: 15, timeLimitMinutes: 30, attempts: 1 });
    expect(moduleTests.bloom).toEqual({ remember: 5, understand: 5, apply: 4, analyze: 1 });
  });

  it('builds the final test from an explicit integer matrix of 40 questions covering every topic', () => {
    const parsed = CourseSchema.parse(loadCourse());
    const { matrix, questions } = parsed.grading.finalTest;
    const levels = BloomLevelSchema.options;
    const total = (level: (typeof levels)[number]) => matrix.reduce((sum, row) => sum + row[level], 0);

    expect(questions).toBe(40);
    expect(matrix.map((row) => row.topic)).toEqual(parsed.topics.map((t) => t.id));
    expect(levels.map(total)).toEqual([10, 12, 12, 6]);
  });

  it('sets the admission threshold so that the final test alone can still reach grade E', () => {
    const { grading, scale } = CourseSchema.parse(loadCourse());
    const passMin = scale.find((band) => band.ects === 'E')?.min;
    expect(grading.admission.minCurrentPoints).toBe(20);
    expect(grading.admission.minCurrentPoints + grading.split.final).toBe(passMin);
  });
});

describe('CourseSchema: module and final tests', () => {
  it('rejects a module test whose Bloom balance does not add up to its question count', () => {
    const wrong = mutated((c) => {
      c.grading.moduleTests.bloom.analyze = 2;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/Блум.*16.*15/));
  });

  it('rejects a module test count that does not match the number of modules', () => {
    const wrong = mutated((c) => {
      byId(c.grading.categories, 'module-tests').items = 3;
      byId(c.grading.categories, 'module-tests').pointsPerItem = 8;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/модульн.*3.*4/));
  });

  it('rejects a final test matrix that does not sum to the question count or skips a topic', () => {
    const wrongSum = mutated((c) => {
      at(c.grading.finalTest.matrix, 0).remember += 1;
    });
    const missingTopic = mutated((c) => {
      c.grading.finalTest.matrix = c.grading.finalTest.matrix.filter((row) => row.topic !== 't12');
    });
    expect(issuesOf(wrongSum)).toContainEqual(expect.stringMatching(/матриц.*41.*40/));
    expect(issuesOf(missingTopic)).toContainEqual(expect.stringMatching(/t12/));
  });

  it('rejects a matrix whose Bloom shares drift from the target by more than one question', () => {
    const drift = mutated((c) => {
      const analyzed = c.grading.finalTest.matrix.filter((row) => row.analyze > 0).slice(0, 3);
      for (const row of analyzed) {
        row.analyze -= 1;
        row.remember += 1;
      }
    });
    expect(issuesOf(drift)).toContainEqual(expect.stringMatching(/remember.*25%/));
  });

  it('rejects non-integer matrix cells and a bank smaller than the test', () => {
    const fractional = mutated((c) => {
      at(c.grading.finalTest.matrix, 0).apply = 0.5;
    });
    const smallBank = mutated((c) => {
      c.grading.finalTest.bankSize = 30;
    });
    expect(issuesOf(fractional).length).toBeGreaterThan(0);
    expect(issuesOf(smallBank)).toContainEqual(expect.stringMatching(/банк.*30.*40/));
  });
});

describe('CourseSchema: grading categories and targets', () => {
  it('reports a missing gradebook category and a practical count that disagrees with the registry', () => {
    const missing = mutated((c) => {
      c.grading.categories = c.grading.categories.filter((category) => category.id !== 'practicals');
      byId(c.grading.categories, 'module-tests').pointsPerItem = 12;
    });
    const count = mutated((c) => {
      byId(c.grading.categories, 'practicals').items = 6;
      byId(c.grading.categories, 'practicals').pointsPerItem = 4;
    });
    expect(issuesOf(missing)).toContainEqual(expect.stringMatching(/немає категорії «practicals»/));
    expect(issuesOf(count)).toContainEqual(expect.stringMatching(/практичних у журналі \(6\).*\(8\)/));
  });

  it('rejects a module bank smaller than the test, target shares that miss 100% and a scale without grade E', () => {
    const smallBank = mutated((c) => {
      c.grading.moduleTests.bankPerModule = 10;
    });
    const shares = mutated((c) => {
      c.grading.finalTest.targetShare.analyze = 20;
    });
    const noE = mutated((c) => {
      c.scale = c.scale.map((band) => (band.ects === 'E' ? { ...band, ects: 'F' } : band));
    });
    expect(issuesOf(smallBank)).toContainEqual(expect.stringMatching(/банку модуля \(10\)/));
    expect(issuesOf(shares)).toContainEqual(expect.stringMatching(/105%/));
    expect(issuesOf(noE)).toContainEqual(expect.stringMatching(/не містить оцінки E/));
  });
});

describe('CourseSchema: rubrics, case project, admission and bonus', () => {
  it('rejects a practical rubric that does not total the practical points', () => {
    const wrong = mutated((c) => {
      const criterion = at(at(c.practicals, 0).rubric, 0);
      criterion.points = 2;
      at(criterion.levels, 0).points = 2;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/p01.*рубрик.*4.*3/));
  });

  it('rejects rubric levels without a top level equal to the criterion points or without zero', () => {
    const noTop = mutated((c) => {
      at(at(at(c.practicals, 0).rubric, 0).levels, 0).points = 0.75;
    });
    const noZero = mutated((c) => {
      const levels = at(at(c.practicals, 0).rubric, 0).levels;
      at(levels, levels.length - 1).points = 0.25;
    });
    expect(issuesOf(noTop)).toContainEqual(expect.stringMatching(/найвищий рівень/));
    expect(issuesOf(noZero)).toContainEqual(expect.stringMatching(/0 балів/));
  });

  it('rejects rubric levels above the criterion points and repeated level points or descriptions', () => {
    const above = mutated((c) => {
      at(at(at(c.practicals, 0).rubric, 0).levels, 1).points = 1.5;
    });
    const repeated = mutated((c) => {
      const levels = at(at(c.practicals, 0).rubric, 0).levels;
      at(levels, 1).points = at(levels, 0).points;
      at(levels, 1).description = at(levels, 0).description;
    });
    expect(issuesOf(above)).toContainEqual(expect.stringMatching(/перевищує бали критерію/));
    expect(issuesOf(repeated)).toEqual(expect.arrayContaining([expect.stringMatching(/бали рівнів повторюються/), expect.stringMatching(/описи рівнів повторюються/)]));
  });

  it('rejects duplicate criterion titles because Moodle needs unique rubric criteria', () => {
    const duplicate = mutated((c) => {
      const rubric = at(c.practicals, 1).rubric;
      at(rubric, 1).title = at(rubric, 0).title;
    });
    expect(issuesOf(duplicate)).toContainEqual(expect.stringMatching(/критері.*повторю/));
  });

  it('rejects a case project rubric that does not total 12 or references an unknown stage', () => {
    const wrongTotal = mutated((c) => {
      const criterion = at(c.grading.caseProject.rubric, 0);
      criterion.points = 2;
      at(criterion.levels, 0).points = 2;
    });
    const unknownStage = mutated((c) => {
      at(c.grading.caseProject.rubric, 0).stage = 'cp-ghost';
    });
    expect(issuesOf(wrongTotal)).toContainEqual(expect.stringMatching(/кейс-проєкт.*13.*12/));
    expect(issuesOf(unknownStage)).toContainEqual(expect.stringMatching(/cp-ghost/));
  });

  it('rejects an admission threshold inconsistent with the final share and the E grade', () => {
    const wrong = mutated((c) => {
      c.grading.admission.minCurrentPoints = 30;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/допуск.*20/));
  });

  it('caps bonus points at 10 and each activity at the bonus cap', () => {
    const tooMuch = mutated((c) => {
      c.grading.bonus.maxPoints = 15;
    });
    const activity = mutated((c) => {
      c.grading.bonus.maxPoints = 5;
    });
    expect(issuesOf(tooMuch).length).toBeGreaterThan(0);
    expect(issuesOf(activity)).toContainEqual(expect.stringMatching(/додатков.*5/));
  });

  it('rejects references to university regulations that are not registered', () => {
    const wrong = mutated((c) => {
      at(c.grading.admission.basis, 0).regulation = 'ghost-regulation';
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/ghost-regulation/));
  });
});
