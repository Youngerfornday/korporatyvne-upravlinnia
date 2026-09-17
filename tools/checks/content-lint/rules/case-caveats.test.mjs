import { describe, expect, it } from 'vitest';
import { course, file } from '../__fixtures__/baseline.mjs';
import { caseAliases, caveatTargets, checkCaseCaveats, forbiddenLaws } from './case-caveats.mjs';

describe('checkCaseCaveats', () => {
  it('reports a causal link where the caveat demands parallel facts', () => {
    const practical = file('content/practicals/p01.yaml', [
      'trainer:',
      '  features:',
      '    - id: f1',
      '      cells:',
      '        - model: japanese',
      '          explanation: Рада Toyota змінила склад під тиском Кодексу КУ Японії.',
    ]);
    const findings = checkCaseCaveats([practical], course.cases);
    expect(findings).toMatchObject([{ level: 'error', rule: 'case-caveat', line: 6 }]);
    expect(findings[0].message).toContain('toyota');
    expect(findings[0].hint).toContain('паралельні');
  });

  it('reports a retelling of a law whose norms are absent from the baseline', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      'Суд закрив провадження на підставі Закону № 590-IX, який передбачає лише грошову компенсацію.',
    ]);
    const findings = checkCaseCaveats([lecture], course.cases);
    expect(findings).toMatchObject([{ level: 'error', line: 1 }]);
    expect(findings[0].message).toContain('590-IX');
  });

  it('accepts parallel facts, a bare mention of the law and the caveat itself', () => {
    const clean = file('content/modules/m1/t01/lecture.mdx', [
      'Того ж року рада Toyota змінила склад; Кодекс КУ Японії діяв з 2021 р.',
      '',
      'Апеляційний суд закрив провадження на підставі Закону № 590-IX.',
    ]);
    expect(checkCaseCaveats([clean], course.cases)).toEqual([]);
    const registry = file('content/course.yaml', ['cases:', '  - id: privatbank', '    caveat: Норми Закону № 590-IX відсутні в базі — стаття не переказується.']);
    expect(checkCaseCaveats([registry], course.cases)).toEqual([]);
  });

  it('derives entity names and forbidden laws from the registry', () => {
    expect(caseAliases('ПриватБанк — виведення з ринку за участю держави (2016)')).toEqual(['приватбанк']);
    expect(caseAliases('Реформа наглядових рад енергетичних держкомпаній після операції «Мідас»')).toEqual(['мідас']);
    expect(forbiddenLaws('Норми Закону № 590-IX відсутні в legal-baseline.md.')).toEqual(['590-IX']);
    expect(caveatTargets('Причинний зв’язок змін у раді Toyota з Кодексом КУ не встановлено.', ['toyota'])).toEqual(['причин', 'кодекс']);
  });

  it('does nothing when no case has a machine-checkable caveat', () => {
    expect(checkCaseCaveats([file('content/x.yaml', ['a: b'])], [{ id: 'x', title: 'X', caveat: 'Просто обережно.' }])).toEqual([]);
  });
});
