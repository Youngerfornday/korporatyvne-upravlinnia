import { describe, expect, it } from 'vitest';
import { at, byId, issuesOf, loadCourse, mutated } from './__fixtures__/course';
import { CourseSchema } from './course';

describe('content/course.yaml', () => {
  it('is valid against CourseSchema', () => {
    expect(issuesOf(loadCourse())).toEqual([]);
  });

  it('seeds 4 modules with 3 topics each and the agreed hours', () => {
    // Act
    const parsed = CourseSchema.parse(loadCourse());

    // Assert
    expect(parsed.modules.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(parsed.topics.map((t) => t.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `t${String(i + 1).padStart(2, '0')}`),
    );
    expect(parsed.hours).toEqual({ total: 120, lectures: 32, practicals: 16, selfStudy: 72 });
    expect(parsed.grading.categories.map((c) => c.items * c.pointsPerItem)).toEqual([24, 24, 12, 40]);
  });

  it('declares the six programme learning outcomes of standard 073 with verbatim codes', () => {
    const parsed = CourseSchema.parse(loadCourse());
    expect(parsed.learningOutcomes.map((o) => o.code)).toEqual(['ПРН3', 'ПРН4', 'ПРН6', 'ПРН11', 'ПРН12', 'ПРН15']);
    expect(parsed.competences.filter((c) => c.kind === 'special').map((c) => c.code)).toEqual(['СК1', 'СК6', 'СК12', 'СК13']);
  });

  it('splits 32 lecture hours into 16 two-hour lectures with exactly four double-lecture topics', () => {
    const parsed = CourseSchema.parse(loadCourse());
    const lectureHours = parsed.topics.map((t) => t.hours.lectures);
    expect(lectureHours.filter((h) => h === 4)).toHaveLength(4);
    expect(lectureHours.filter((h) => h === 2)).toHaveLength(8);
  });

  it('registers 10–15 glossary terms per topic, about 150 in total', () => {
    const parsed = CourseSchema.parse(loadCourse());
    for (const topic of parsed.topics) {
      const count = parsed.glossaryTerms.filter((term) => term.topic === topic.id).length;
      expect(count, topic.id).toBeGreaterThanOrEqual(10);
      expect(count, topic.id).toBeLessThanOrEqual(15);
    }
    expect(parsed.glossaryTerms.length).toBeGreaterThanOrEqual(140);
    expect(parsed.glossaryTerms.length).toBeLessThanOrEqual(165);
  });
});

describe('CourseSchema: registry integrity', () => {
  it('rejects duplicate topic ids and slugs', () => {
    const duplicate = mutated((c) => {
      c.topics.push(structuredClone(at(c.topics, 0)));
    });
    const issues = issuesOf(duplicate);
    expect(issues).toContainEqual(expect.stringMatching(/t01/));
    expect(issues).toContainEqual(expect.stringMatching(/slug/));
  });

  it('rejects a glossary term registered twice, even under different modules', () => {
    const duplicate = mutated((c) => {
      c.glossaryTerms.push({ id: 'agency-problem', topic: 't10', term: 'Агентський конфлікт' });
    });
    expect(issuesOf(duplicate)).toContainEqual(expect.stringMatching(/agency-problem/));
  });

  it('rejects two registry terms with the same name under different ids', () => {
    const duplicate = mutated((c) => {
      c.glossaryTerms.push({ id: 'agency-dilemma', topic: 't12', term: 'агентська  проблема' });
    });
    expect(issuesOf(duplicate)).toContainEqual(expect.stringMatching(/Агентська проблема/i));
  });

  it('rejects duplicate module and learning outcome ids and codes', () => {
    const data = loadCourse();
    expect(issuesOf({ ...data, modules: [...data.modules, { id: 'm1', title: 'Копія' }] })).toContainEqual(
      expect.stringMatching(/m1/),
    );
    const outcome = at(data.learningOutcomes, 0);
    expect(issuesOf({ ...data, learningOutcomes: [...data.learningOutcomes, { ...outcome }] })).toEqual(
      expect.arrayContaining([expect.stringMatching(new RegExp(outcome.id)), expect.stringMatching(/ПРН3/)]),
    );
  });

  it('rejects references to modules, topics and outcomes that are not registered', () => {
    const badTopic = mutated((c) => {
      at(c.topics, 0).module = 'm9';
    });
    const badTerm = mutated((c) => {
      c.glossaryTerms.push({ id: 'orphan', topic: 't99', term: 'Сирота' });
    });
    const badOutcome = mutated((c) => {
      at(c.learningOutcomes, 0).topics.push('t42');
    });
    const badResult = mutated((c) => {
      at(at(c.topics, 0).results, 0).prn.push('prn77');
    });
    expect(issuesOf(badTopic)).toContainEqual(expect.stringMatching(/m9/));
    expect(issuesOf(badTerm)).toContainEqual(expect.stringMatching(/t99/));
    expect(issuesOf(badOutcome)).toContainEqual(expect.stringMatching(/t42/));
    expect(issuesOf(badResult)).toContainEqual(expect.stringMatching(/prn77/));
  });

  it('rejects a module without topics', () => {
    const empty = mutated((c) => {
      c.modules.push({ id: 'm5', title: 'Порожній' });
    });
    expect(issuesOf(empty)).toContainEqual(expect.stringMatching(/m5/));
  });
});

describe('CourseSchema: topic results and programme outcome coverage', () => {
  it('requires 3–4 learning results per topic', () => {
    const tooFew = mutated((c) => {
      const topic = at(c.topics, 1);
      topic.results = topic.results.slice(0, 2);
    });
    const tooMany = mutated((c) => {
      const topic = at(c.topics, 1);
      topic.results = [...topic.results, ...topic.results].slice(0, 5);
    });
    expect(issuesOf(tooFew)).toContainEqual(expect.stringMatching(/3–4 результати/));
    expect(issuesOf(tooMany)).toContainEqual(expect.stringMatching(/3–4 результати/));
  });

  it('rejects a programme outcome that no topic result covers', () => {
    const uncovered = mutated((c) => {
      for (const result of c.topics.flatMap((topic) => topic.results)) {
        const others = result.prn.filter((id) => id !== 'prn11');
        result.prn = others.length > 0 ? others : ['prn04'];
      }
      byId(c.learningOutcomes, 'prn11').topics = [];
    });
    expect(issuesOf(uncovered)).toContainEqual(expect.stringMatching(/prn11.*тем/));
  });

  it('rejects a programme outcome that no practical covers', () => {
    const uncovered = mutated((c) => {
      for (const practical of c.practicals) practical.prn = practical.prn.filter((id) => id !== 'prn03');
      byId(c.learningOutcomes, 'prn03').practicals = [];
    });
    expect(issuesOf(uncovered)).toContainEqual(expect.stringMatching(/prn03.*практичн/));
  });

  it('rejects outcome topics and practicals that disagree with topic results and practical registry', () => {
    const topicDrift = mutated((c) => {
      byId(c.learningOutcomes, 'prn03').topics = ['t01'];
    });
    const practicalDrift = mutated((c) => {
      byId(c.learningOutcomes, 'prn03').practicals = ['p08'];
    });
    expect(issuesOf(topicDrift)).toContainEqual(expect.stringMatching(/prn03.*теми/));
    expect(issuesOf(practicalDrift)).toContainEqual(expect.stringMatching(/prn03.*практичні/));
  });
});

describe('CourseSchema: hours, grading and scale', () => {
  it('rejects hours that do not add up or do not match the credits', () => {
    const data = loadCourse();
    expect(issuesOf({ ...data, hours: { total: 120, lectures: 30, practicals: 16, selfStudy: 72 } })).toContainEqual(
      expect.stringMatching(/годин/),
    );
    expect(issuesOf({ ...data, credits: 3 })).toContainEqual(expect.stringMatching(/кредит/));
  });

  it('rejects topic lecture hours that do not sum to course lectures or are not whole two-hour lectures', () => {
    const wrongSum = mutated((c) => {
      at(c.topics, 0).hours.lectures = 4;
    });
    const oddHours = mutated((c) => {
      at(c.topics, 0).hours.lectures = 3;
      at(c.topics, 1).hours.lectures = 1;
    });
    expect(issuesOf(wrongSum)).toContainEqual(expect.stringMatching(/лекці.*34.*32/));
    expect(issuesOf(oddHours)).toContainEqual(expect.stringMatching(/t01.*2 год/));
  });

  it('rejects self-study hours that do not sum to 72 or disagree with the topic tasks', () => {
    const wrongTotal = mutated((c) => {
      const topic = at(c.topics, 0);
      topic.hours.selfStudy += 1;
      at(topic.selfStudyTasks, 0).hours += 1;
    });
    const wrongTasks = mutated((c) => {
      at(at(c.topics, 0).selfStudyTasks, 0).hours += 1;
    });
    expect(issuesOf(wrongTotal)).toContainEqual(expect.stringMatching(/СРС.*73.*72/));
    expect(issuesOf(wrongTasks)).toContainEqual(expect.stringMatching(/t01.*завдан/));
  });

  it('rejects practical hours that do not sum to course practicals', () => {
    const wrong = mutated((c) => {
      at(c.practicals, 0).hours = 4;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/практичн.*18.*16/));
  });

  it('rejects grading that does not total 100 or breaks the current/final split', () => {
    const wrong = mutated((c) => {
      byId(c.grading.categories, 'case-project').pointsPerItem = 10;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/current/));
  });

  it('follows the university scale and rejects a scale with a gap or an overlap', () => {
    const parsed = CourseSchema.parse(loadCourse());
    expect(parsed.scale.map((band) => `${band.ects} ${band.min}–${band.max}`)).toEqual([
      'A 90–100',
      'B 82–89',
      'C 75–81',
      'D 66–74',
      'E 60–65',
      'FX 0–59',
    ]);
    const gap = mutated((c) => {
      const band = c.scale.find((b) => b.ects === 'B');
      if (band) band.min = 83;
    });
    const overlap = mutated((c) => {
      const band = c.scale.find((b) => b.ects === 'C');
      if (band) band.max = 85;
    });
    expect(issuesOf(gap)).toContainEqual(expect.stringMatching(/шкал/i));
    expect(issuesOf(overlap)).toContainEqual(expect.stringMatching(/шкал/i));
  });

  it('allows the teacher placeholder but rejects an invalid e-mail when real data is added', () => {
    const data = loadCourse();
    expect(issuesOf({ ...data, teacher: { isPlaceholder: false, name: 'Ім’я', email: 'not-an-email' } }).length).toBeGreaterThan(0);
  });
});
