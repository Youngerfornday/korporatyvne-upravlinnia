import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ddwtos, multichoiceSingle, trueFalse } from '../schemas/__fixtures__/questions';
import { BankFileSchema } from '../schemas/questions';
import { CourseSchema, type Course } from '../schemas/course';
import { GlossaryFileSchema } from '../schemas/glossary';
import { SourcesFileSchema } from '../schemas/sources';
import { TopicFrontmatterSchema } from '../schemas/topic';
import { checkBanks, checkGlossaries, checkSources, checkTopics, formatIssues } from './checks';

const registry: Course = CourseSchema.parse(
  parse(readFileSync(new URL('../../../content/course.yaml', import.meta.url), 'utf8')),
);

const topicEntry = (filePath: string, data: Record<string, unknown>) => ({
  filePath,
  data: TopicFrontmatterSchema.parse({ description: 'Опис теми для пошуку.', updatedAt: '2026-09-14', ...data }),
});

const glossaryEntry = (filePath: string, topic: string, terms: Array<{ id: string; term: string }>) => ({
  filePath,
  data: GlossaryFileSchema.parse({ topic, terms: terms.map((t) => ({ ...t, definition: `Визначення: ${t.term}.` })) }),
});

const bankEntry = (filePath: string, data: Record<string, unknown>) => ({
  filePath,
  data: BankFileSchema.parse({ schemaVersion: 1, kind: 'training', ...data }),
});

describe('checkTopics', () => {
  it('passes a lecture that matches the registry and its folder', () => {
    const entries = [topicEntry('content/modules/m1/t01/lecture.mdx', { id: 't01', keyTerms: ['agency-problem'], learningOutcomes: ['prn01'] })];
    expect(checkTopics(entries, registry)).toEqual([]);
  });

  it('reports an unregistered topic, a wrong folder and unknown references', () => {
    const entries = [
      topicEntry('content/modules/m2/t01/lecture.mdx', { id: 't01' }),
      topicEntry('content/modules/m1/t99/lecture.mdx', { id: 't99' }),
      topicEntry('content/modules/m1/t02/lecture.mdx', { id: 't02', keyTerms: ['ghost-term'], learningOutcomes: ['prn77'] }),
    ];
    const messages = checkTopics(entries, registry).map((issue) => issue.message).join('\n');
    expect(messages).toMatch(/m2\/t01/);
    expect(messages).toMatch(/t99/);
    expect(messages).toMatch(/ghost-term/);
    expect(messages).toMatch(/prn77/);
  });

  it('reports the same topic id used by two lecture files', () => {
    const entries = [
      topicEntry('content/modules/m1/t01/lecture.mdx', { id: 't01' }),
      topicEntry('content/modules/m1/t02/lecture.mdx', { id: 't01' }),
    ];
    expect(checkTopics(entries, registry).map((issue) => issue.message)).toContainEqual(expect.stringMatching(/дублікат.*t01/i));
  });
});

describe('checkGlossaries', () => {
  it('passes registered terms defined in their own topic', () => {
    const entries = [glossaryEntry('content/modules/m1/t01/glossary.yaml', 't01', [{ id: 'agency-problem', term: 'Агентська проблема' }])];
    expect(checkGlossaries(entries, registry)).toEqual([]);
  });

  it('reports a term defined in two modules', () => {
    const entries = [
      glossaryEntry('content/modules/m1/t01/glossary.yaml', 't01', [{ id: 'agency-problem', term: 'Агентська проблема' }]),
      glossaryEntry('content/modules/m4/t12/glossary.yaml', 't12', [{ id: 'agency-problem', term: 'Агентський конфлікт' }]),
    ];
    const messages = checkGlossaries(entries, registry).map((issue) => issue.message).join('\n');
    expect(messages).toMatch(/дублікат.*agency-problem/i);
  });

  it('reports the same label defined under different ids in different files', () => {
    const entries = [
      glossaryEntry('content/modules/m1/t01/glossary.yaml', 't01', [{ id: 'corporation', term: 'Корпорація' }]),
      glossaryEntry('content/modules/m1/t01/extra/glossary.yaml', 't01', [{ id: 'corporate-governance', term: 'корпорація' }]),
    ];
    expect(checkGlossaries(entries, registry).map((i) => i.message).join('\n')).toMatch(/Корпорація/i);
  });

  it('reports unregistered terms, terms from another topic and a topic that does not match the folder', () => {
    const entries = [
      glossaryEntry('content/modules/m1/t02/glossary.yaml', 't02', [
        { id: 'unregistered', term: 'Незареєстрований' },
        { id: 'corporation', term: 'Корпорація' },
      ]),
      glossaryEntry('content/modules/m1/t03/glossary.yaml', 't01', []),
    ];
    const messages = checkGlossaries(entries, registry).map((issue) => issue.message).join('\n');
    expect(messages).toMatch(/unregistered/);
    expect(messages).toMatch(/corporation.*t01/);
    expect(messages).toMatch(/m1\/t03/);
  });
});

describe('checkSources', () => {
  it('reports a sources file whose topic does not match its folder', () => {
    const data = SourcesFileSchema.parse({
      topic: 't05',
      sources: [{ id: 'oecd-2023', type: 'standard', title: 'G20/OECD Principles', url: 'https://www.oecd.org/', checkedAt: '2026-09-01' }],
    });
    expect(checkSources([{ filePath: 'content/modules/m2/t05/sources.yaml', data }], registry)).toEqual([]);
    expect(checkSources([{ filePath: 'content/modules/m2/t04/sources.yaml', data }], registry)).toHaveLength(1);
  });
});

describe('checkBanks', () => {
  it('passes a training bank whose questions belong to its module', () => {
    const entries = [bankEntry('content/banks/training/m2.yaml', { module: 'm2', questions: [multichoiceSingle(), ddwtos()] })];
    expect(checkBanks(entries, registry)).toEqual([]);
  });

  it('reports duplicate question ids between module banks', () => {
    const entries = [
      bankEntry('content/banks/training/m1.yaml', { module: 'm1', questions: [trueFalse()] }),
      bankEntry('content/banks/training/m1-extra.yaml', { module: 'm1', questions: [trueFalse()] }),
    ];
    expect(checkBanks(entries, registry).map((i) => i.message).join('\n')).toMatch(/дублікат.*t01-q003/i);
  });

  it('reports a question from another module, a wrong file name and a control bank in the public tree', () => {
    const entries = [
      bankEntry('content/banks/training/m1.yaml', { module: 'm1', questions: [multichoiceSingle()] }),
      bankEntry('content/banks/training/m3.yaml', { module: 'm2', questions: [ddwtos()] }),
      {
        filePath: 'content/banks/training/m4.yaml',
        data: { ...bankEntry('x', { module: 'm4', questions: [{ ...trueFalse(), id: 't10-q001', topic: 't10' }] }).data, kind: 'control' as const },
      },
    ];
    const messages = checkBanks(entries, registry).map((issue) => issue.message).join('\n');
    expect(messages).toMatch(/t04-q001.*m2/);
    expect(messages).toMatch(/m3\.yaml/);
    expect(messages).toMatch(/контрольн/i);
  });
});

describe('formatIssues', () => {
  it('produces one readable line per issue under a collection heading', () => {
    const text = formatIssues('glossary', [
      { file: 'content/modules/m1/t01/glossary.yaml', message: 'Дублікат ID терміна «corporation»' },
    ]);
    expect(text).toBe(
      'Перевірка цілісності колекції «glossary» не пройдена (1):\n' +
        '  - content/modules/m1/t01/glossary.yaml: Дублікат ID терміна «corporation»',
    );
  });
});
