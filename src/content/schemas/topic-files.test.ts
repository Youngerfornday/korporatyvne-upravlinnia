import { describe, expect, it } from 'vitest';
import { GlossaryFileSchema } from './glossary';
import { SourcesFileSchema } from './sources';
import { TopicFrontmatterSchema } from './topic';

const lecture = () => ({
  id: 't01',
  description: 'Чому власники й менеджери мають різні інтереси і як корпоративне управління їх узгоджує.',
  learningOutcomes: ['prn01'],
  keyTerms: ['agency-problem'],
  status: 'draft',
  updatedAt: '2026-09-14',
});

const glossary = () => ({
  topic: 't01',
  terms: [
    {
      id: 'agency-problem',
      term: 'Агентська проблема',
      definition: 'Конфлікт інтересів між власниками (принципалами) і менеджерами (агентами).',
      seeAlso: ['corporate-governance'],
    },
    { id: 'corporation', term: 'Корпорація', definition: 'Юридична особа, капітал якої поділено на частки учасників.' },
  ],
});

const sources = () => ({
  topic: 't01',
  sources: [
    {
      id: 'law-2465-ix',
      type: 'law',
      title: 'Закон України «Про акціонерні товариства» № 2465-IX',
      url: 'https://zakon.rada.gov.ua/laws/show/2465-20',
      checkedAt: '2026-09-01',
    },
  ],
});

describe('TopicFrontmatterSchema', () => {
  it('accepts a lecture frontmatter and applies defaults', () => {
    const parsed = TopicFrontmatterSchema.parse({ id: 't02', description: 'Моделі корпоративного управління у світі.', updatedAt: '2026-09-14' });
    expect(parsed).toMatchObject({ learningOutcomes: [], keyTerms: [], lawRef: [], status: 'draft' });
    expect(TopicFrontmatterSchema.safeParse(lecture()).success).toBe(true);
  });

  it('rejects a malformed topic id, an unknown status and duplicate key terms', () => {
    expect(TopicFrontmatterSchema.safeParse({ ...lecture(), id: 'topic-1' }).success).toBe(false);
    expect(TopicFrontmatterSchema.safeParse({ ...lecture(), status: 'done' }).success).toBe(false);
    expect(TopicFrontmatterSchema.safeParse({ ...lecture(), keyTerms: ['corporation', 'corporation'] }).success).toBe(false);
  });
});

describe('GlossaryFileSchema', () => {
  it('accepts a glossary file', () => {
    expect(GlossaryFileSchema.safeParse(glossary()).success).toBe(true);
  });

  it('rejects duplicate term ids and duplicate term labels within a file', () => {
    const data = glossary();
    const duplicateId = { ...data, terms: [...data.terms, { ...data.terms[0], term: 'Інша назва' }] };
    const duplicateLabel = { ...data, terms: [...data.terms, { ...data.terms[0], id: 'agency-conflict', term: 'агентська  проблема' }] };
    expect(GlossaryFileSchema.safeParse(duplicateId).success).toBe(false);
    expect(GlossaryFileSchema.safeParse(duplicateLabel).success).toBe(false);
  });

  it('rejects a term that refers to itself in seeAlso', () => {
    const data = glossary();
    const selfRef = { ...data, terms: [{ ...data.terms[0], seeAlso: ['agency-problem'] }] };
    expect(GlossaryFileSchema.safeParse(selfRef).success).toBe(false);
  });
});

describe('SourcesFileSchema', () => {
  it('accepts sources with URL and check date', () => {
    expect(SourcesFileSchema.safeParse(sources()).success).toBe(true);
  });

  it('requires an http(s) URL and a check date for every source', () => {
    const data = sources();
    const [source] = data.sources;
    const { checkedAt: _c, ...withoutDate } = source!;
    expect(SourcesFileSchema.safeParse({ ...data, sources: [withoutDate] }).success).toBe(false);
    expect(SourcesFileSchema.safeParse({ ...data, sources: [{ ...source, url: 'ftp://example.com/x' }] }).success).toBe(false);
    expect(SourcesFileSchema.safeParse({ ...data, sources: [{ ...source, url: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  it('rejects duplicate source ids within a file', () => {
    const data = sources();
    expect(SourcesFileSchema.safeParse({ ...data, sources: [...data.sources, ...data.sources] }).success).toBe(false);
  });
});
