import { describe, expect, it } from 'vitest';
import { at, issuesOf, loadCourse, mutated, type CourseInput } from './__fixtures__/course';
import { CourseSchema } from './course';

type Week = CourseInput['calendar']['schedule'][number];

function week(course: CourseInput, number: number): Week {
  const found = course.calendar.schedule.find((entry) => entry.week === number);
  if (!found) throw new Error(`Немає тижня ${number}`);
  return found;
}

describe('course.yaml: calendar', () => {
  it('plans 16 weeks with 16 lectures, 8 practicals, 4 module tests and the final test in the last week', () => {
    const { calendar } = CourseSchema.parse(loadCourse());
    const activities = calendar.schedule.flatMap((entry) => entry.activities.map((activity) => ({ ...activity, week: entry.week })));
    const count = (type: string) => activities.filter((activity) => activity.type === type).length;

    expect(calendar.schedule.map((entry) => entry.week)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect([count('lecture'), count('practical'), count('module-test'), count('final-test')]).toEqual([16, 8, 4, 1]);
    expect(activities.find((activity) => activity.type === 'final-test')?.week).toBe(16);
  });
});

describe('CourseSchema: calendar consistency', () => {
  it('rejects a missing or duplicated week', () => {
    const missing = mutated((c) => {
      c.calendar.schedule = c.calendar.schedule.filter((entry) => entry.week !== 9);
    });
    expect(issuesOf(missing)).toContainEqual(expect.stringMatching(/тиж.*9/));
  });

  it('rejects lecture counts that disagree with topic lecture hours', () => {
    const wrong = mutated((c) => {
      week(c, 5).activities = week(c, 5).activities.filter((activity) => activity.type !== 'lecture');
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/t04.*лекці/));
  });

  it('rejects a practical scheduled before the first lecture of its topics', () => {
    const early = mutated((c) => {
      week(c, 6).activities = week(c, 6).activities.filter((activity) => activity.type !== 'practical');
      week(c, 3).activities.push({ type: 'practical', practical: 'p03' });
    });
    expect(issuesOf(early)).toContainEqual(expect.stringMatching(/p03.*t04/));
  });

  it('rejects a module test before the last lecture of its module and a practical scheduled twice', () => {
    const early = mutated((c) => {
      week(c, 4).activities = week(c, 4).activities.filter((activity) => activity.type !== 'module-test');
      week(c, 2).activities.push({ type: 'module-test', module: 'm1' });
    });
    const twice = mutated((c) => {
      week(c, 16).activities.push({ type: 'practical', practical: 'p01' });
    });
    expect(issuesOf(early)).toContainEqual(expect.stringMatching(/m1.*тиж/));
    expect(issuesOf(twice)).toContainEqual(expect.stringMatching(/p01.*1 раз/));
  });

  it('rejects case project stages out of order and a final test before the module tests', () => {
    const disordered = mutated((c) => {
      week(c, 15).activities = week(c, 15).activities.filter((activity) => activity.type !== 'case-project');
      week(c, 5).activities.push({ type: 'case-project', stage: 'cp-control' });
    });
    const earlyFinal = mutated((c) => {
      week(c, 16).activities = week(c, 16).activities.filter((activity) => activity.type !== 'final-test');
      week(c, 12).activities.push({ type: 'final-test' });
    });
    expect(issuesOf(disordered)).toContainEqual(expect.stringMatching(/cp-control.*поряд/));
    expect(issuesOf(earlyFinal)).toContainEqual(expect.stringMatching(/[Пп]ідсумков.*модульн/));
  });

  it('rejects calendar references to unknown topics, practicals, modules and stages', () => {
    const unknown = mutated((c) => {
      at(c.calendar.schedule, 0).activities.push(
        { type: 'lecture', topic: 't42' },
        { type: 'practical', practical: 'p42' },
        { type: 'module-test', module: 'm9' },
        { type: 'case-project', stage: 'cp-ghost' },
      );
    });
    const issues = issuesOf(unknown).join('\n');
    for (const id of ['t42', 'p42', 'm9', 'cp-ghost']) expect(issues).toMatch(new RegExp(id));
  });
});
