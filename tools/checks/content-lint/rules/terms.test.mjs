import { describe, expect, it } from 'vitest';
import { course, file } from '../__fixtures__/baseline.mjs';
import { checkTerms, termUsages } from './terms.mjs';

const glossary = file('content/modules/m1/t01/glossary.yaml', [
  'topic: t01',
  'terms:',
  '  - id: corporation',
  '    term: Корпорація',
]);

const lecture = (body) => file('content/modules/m1/t01/lecture.mdx', [
  '---',
  'id: t01',
  'keyTerms:',
  '  - corporation',
  'updatedAt: 2026-09-16',
  '---',
  ...body,
]);

describe('checkTerms', () => {
  it('reports a term that belongs to another topic', () => {
    const findings = checkTerms([lecture(['Текст про <Term id="squeeze-out">примусовий викуп</Term>.']), glossary], course);
    expect(findings).toMatchObject([{ level: 'error', rule: 'term', line: 7 }]);
    expect(findings[0].message).toContain('t04');
    expect(findings[0].hint).toContain('тема-власник');
  });

  it('accepts a term of this topic that is defined and declared', () => {
    expect(checkTerms([lecture(['Текст про <Term id="corporation">корпорацію</Term>.']), glossary], course)).toEqual([]);
  });

  it('reports an unknown id and a term without a definition, warns about a missing keyTerm', () => {
    const unknown = checkTerms([lecture(['<Term id="ghost-term">привид</Term>']), glossary], course);
    expect(unknown).toMatchObject([{ level: 'error', message: expect.stringContaining('не зареєстровано') }]);

    const registry = { glossaryTerms: [{ id: 'agent', topic: 't01' }, ...course.glossaryTerms] };
    const findings = checkTerms([lecture(['<Term id="agent">агент</Term>']), glossary], registry);
    expect(findings.map((finding) => finding.level)).toEqual(['error', 'warning']);
    expect(findings[0].message).toContain('glossary.yaml');
    expect(findings[1].message).toContain('keyTerms');
  });

  it('checks term ids of a practical trainer', () => {
    const practical = file('content/practicals/p01.yaml', ['trainer:', '  models:', '    - id: anglo', '      term: ghost-model']);
    expect(checkTerms([practical], course)).toMatchObject([{ level: 'error', line: 4 }]);
  });

  it('finds all <Term> usages with their lines', () => {
    expect(termUsages(lecture(['<Term id="corporation">а</Term> і <Term id="agent">б</Term>']))).toEqual([
      { id: 'corporation', line: 7 },
      { id: 'agent', line: 7 },
    ]);
  });
});
