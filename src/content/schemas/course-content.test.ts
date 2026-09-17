import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { at, byId, issuesOf, loadCourse, mutated } from './__fixtures__/course';
import { CourseSchema, type Course } from './course';

const RESEARCH_DOCS = ['education-standard', 'legal-baseline', 'data-sources', 'cases'] as const;
type ResearchDoc = (typeof RESEARCH_DOCS)[number];

function researchDoc(doc: ResearchDoc): string {
  return readFileSync(new URL(`../../../docs/research/${doc}.md`, import.meta.url), 'utf8');
}

/** Усі посилання course.yaml на розділи docs/research (кейси, дані практичних, стандарт, нормативна база). */
function researchRefs(course: Course): Array<{ doc: ResearchDoc; section: string; where: string }> {
  return [
    { ...course.program.standard.ref, where: 'program.standard' },
    { ...course.program.specialtyCorrespondence.ref, where: 'program.specialtyCorrespondence' },
    { ...course.integralCompetence.ref, where: 'integralCompetence' },
    ...course.regulations.map((r) => ({ ...r.ref, where: `regulations.${r.id}` })),
    ...course.cases.map((c) => ({ ...c.ref, where: `cases.${c.id}` })),
    ...course.practicals.flatMap((p) => p.data.map((d) => ({ ...d.ref, where: `practicals.${p.id}` }))),
    ...course.literature.normative.map((n) => ({ ...n.ref, where: `literature.normative ${n.title}` })),
  ];
}

describe('course.yaml: references to docs/research', () => {
  it('points only to sections that exist in the research documents', () => {
    const texts = new Map(RESEARCH_DOCS.map((doc) => [doc, researchDoc(doc)]));
    const missing = researchRefs(CourseSchema.parse(loadCourse())).filter(({ doc, section }) => {
      const heading = new RegExp(`^#{2,4} ${section.replace('.', '\\.')}\\. `, 'm');
      return !heading.test(texts.get(doc) ?? '');
    });
    expect(missing).toEqual([]);
  });

  it('quotes programme outcomes and special competences verbatim from the standard', () => {
    const standard = researchDoc('education-standard').replace(/\s+/g, ' ').replace(/'/g, '’');
    const course = CourseSchema.parse(loadCourse());
    // Формулювання звіряємо дослівно, а код — окремо: у дослідженні він може стояти в таблиці, а не перед текстом.
    const items = [...course.learningOutcomes, ...course.competences.filter((c) => c.source === 'standard')];
    for (const item of items) {
      expect(standard).toContain(item.statement);
      expect(standard).toContain(item.code);
    }
    expect(standard).toContain(course.integralCompetence.statement);
  });
});

describe('course.yaml: decisions that need the client’s confirmation', () => {
  it('flags discipline status, final control, semester, specialty record, volume, AI model and non-formal education', () => {
    const { program, policies } = CourseSchema.parse(loadCourse());
    expect(program.disciplineStatus).toMatchObject({ value: 'вибіркова', needsConfirmation: true });
    expect(program.finalControl).toMatchObject({ value: 'диференційований залік', needsConfirmation: true });
    for (const item of [program.semester, program.specialtyRecord, program.volume, policies.aiModel, policies.nonFormalEducation]) {
      expect(item.needsConfirmation).toBe(true);
    }
    expect(program.specialtyCode).toBe('073');
    expect(program.specialtyCorrespondence.code).toBe('D3');
  });

  it('requires a note explaining what to confirm', () => {
    const silent = mutated((c) => {
      delete c.program.semester.note;
    });
    expect(issuesOf(silent)).toContainEqual(expect.stringMatching(/звірити/));
  });
});

describe('CourseSchema: cases', () => {
  it('rejects a topic case that is not registered', () => {
    const wrong = mutated((c) => {
      at(c.topics, 0).cases.push({ case: 'ghost-case', focus: 'Вигаданий кейс.' });
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/ghost-case/));
  });

  it('rejects a case whose primary topic does not tell its story', () => {
    const wrong = mutated((c) => {
      byId(c.cases, 'enron').primaryTopic = 't02';
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/enron.*t02/));
  });

  it('rejects the same case focus repeated in two topics', () => {
    const repeated = mutated((c) => {
      const source = at(c.topics, 0).cases.find((item) => item.case === 'enron');
      const target = at(c.topics, 8).cases.find((item) => item.case === 'enron');
      if (!source || !target) throw new Error('Кейс Enron має бути в темах t01 і t09');
      target.focus = source.focus;
    });
    expect(issuesOf(repeated)).toContainEqual(expect.stringMatching(/enron.*фабул/));
  });

  it('requires a Ukrainian and an international case in every topic', () => {
    const noUkrainian = mutated((c) => {
      const topic = at(c.topics, 0);
      topic.cases = topic.cases.filter((item) => item.case !== 'privatbank');
      byId(c.cases, 'privatbank').primaryTopic = 't03';
    });
    expect(issuesOf(noUkrainian)).toContainEqual(expect.stringMatching(/t01.*україн/));
  });
});

describe('CourseSchema: competences and practicals registry', () => {
  it('rejects duplicate competence codes, unknown topics and an id that does not match the kind', () => {
    const wrong = mutated((c) => {
      const special = at(c.competences, 0);
      c.competences.push({ ...special, id: 'zk01', topics: ['t77'] });
    });
    const issues = issuesOf(wrong).join('\n');
    expect(issues).toMatch(/СК1/);
    expect(issues).toMatch(/t77/);
    expect(issues).toMatch(/zk01/);
  });

  it('rejects a practical whose first topic belongs to another module or that uses unknown ids', () => {
    const wrongModule = mutated((c) => {
      at(c.practicals, 0).module = 'm2';
    });
    const unknown = mutated((c) => {
      const practical = at(c.practicals, 0);
      practical.topics.push('t77');
      practical.prn.push('prn77');
    });
    expect(issuesOf(wrongModule)).toContainEqual(expect.stringMatching(/p01.*m2/));
    const issues = issuesOf(unknown).join('\n');
    expect(issues).toMatch(/t77/);
    expect(issues).toMatch(/prn77/);
  });
});

describe('CourseSchema: literature', () => {
  it('rejects an ISBN with a wrong check digit', () => {
    const wrong = mutated((c) => {
      const book = c.literature.main.find((item) => item.isbn !== undefined);
      if (!book?.isbn) throw new Error('Потрібна хоча б одна основна позиція з ISBN');
      const last = Number(book.isbn.at(-1));
      book.isbn = `${book.isbn.slice(0, -1)}${(last + 1) % 10}`;
    });
    expect(issuesOf(wrong)).toContainEqual(expect.stringMatching(/ISBN/));
  });

  it('keeps 3–5 main and 5–8 additional modern sources with unique ids', () => {
    const tooOld = mutated((c) => {
      at(c.literature.additional, 0).year = 2010;
    });
    const duplicate = mutated((c) => {
      c.literature.additional.splice(0, 1, { ...at(c.literature.main, 0) });
    });
    expect(issuesOf(tooOld).length).toBeGreaterThan(0);
    expect(issuesOf(duplicate).join('\n')).toMatch(new RegExp(at(loadCourse().literature.main, 0).id));
  });
});
