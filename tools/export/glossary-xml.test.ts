import { describe, expect, it } from 'vitest';
import { GlossaryFileSchema, type GlossaryFile } from '../../src/content/schemas/glossary.ts';
import { REGISTRY } from './__fixtures__/registry.ts';
import {
  describeGlossaryPlan,
  findGlossaryProblems,
  glossaryToMoodleXml,
  planGlossaryExport,
} from './glossary-xml.ts';
import { ExportError } from './registry.ts';
import { child, childrenNamed, parseXml, textAt, type XmlNode } from './test-support/xml-tree.ts';

const NAME = 'Глосарій курсу «Корпоративне управління»';

function file(raw: unknown): GlossaryFile {
  return GlossaryFileSchema.parse(raw);
}

const T01 = file({
  topic: 't01',
  terms: [
    {
      id: 'corporation',
      term: 'Корпорація',
      definition: 'Юридична особа A & B.\n\nДругий абзац із "лапками".',
      synonyms: ['корпоративне підприємство', 'корпоративне підприємство'],
      seeAlso: ['agency-problem'],
    },
    { id: 'agency-problem', term: 'Агентська проблема', definition: 'Конфлікт інтересів.' },
  ],
});

const T07 = file({
  topic: 't07',
  terms: [{ id: 'dividend', term: 'Дивіденд', definition: 'Частина прибутку.', seeAlso: ['corporation'] }],
});

function entries(xml: string): XmlNode[] {
  return childrenNamed(child(child(parseXml(xml), 'INFO'), 'ENTRIES'), 'ENTRY');
}

describe('glossaryToMoodleXml', () => {
  it('снапшот формату «Імпорт записів»', () => {
    expect(glossaryToMoodleXml([T01, T07], REGISTRY, { name: NAME })).toMatchSnapshot();
  });

  it('записи, синоніми й категорії за темами; порядок — за реєстром', () => {
    const xml = glossaryToMoodleXml([T07, T01], REGISTRY, { name: NAME });
    expect(() => parseXml(xml)).not.toThrow();
    const found = entries(xml);
    expect(found.map((entry) => textAt(entry, 'CONCEPT'))).toEqual(['Корпорація', 'Агентська проблема', 'Дивіденд']);
    expect(childrenNamed(child(found[0] as XmlNode, 'ALIASES'), 'ALIAS').map((alias) => textAt(alias, 'NAME'))).toEqual([
      'корпоративне підприємство',
    ]);
    expect(childrenNamed(child(found[0] as XmlNode, 'CATEGORIES'), 'CATEGORY').map((entry) => textAt(entry, 'NAME'))).toEqual([
      'Тема 01. Корпорація',
    ]);
    expect(childrenNamed(child(found[2] as XmlNode, 'CATEGORIES'), 'CATEGORY').map((entry) => textAt(entry, 'NAME'))).toEqual([
      'Тема 07. Капітал і дивіденди',
    ]);
    expect(childrenNamed(found[1] as XmlNode, 'ALIASES')).toHaveLength(0);
  });

  it('означення — HTML з абзацами, типографікою й посиланням «Див. також»', () => {
    const [corporation, , dividend] = entries(glossaryToMoodleXml([T01, T07], REGISTRY, { name: NAME })) as [XmlNode, XmlNode, XmlNode];
    expect(textAt(corporation, 'DEFINITION')).toBe(
      '<p>Юридична особа A &amp; B.</p><p>Другий абзац із «лапками».</p><p>Див. також: Агентська проблема.</p>',
    );
    expect(textAt(corporation, 'FORMAT')).toBe('1');
    expect(textAt(corporation, 'TEACHERENTRY')).toBe('1');
    // Посилання між модулями розв’язується завдяки списку всіх файлів.
    expect(textAt(dividend, 'DEFINITION')).toContain('<p>Див. також: Корпорація.</p>');
  });

  it('налаштування глосарію: без дублікатів, словник, записи одразу схвалені', () => {
    const info = child(parseXml(glossaryToMoodleXml([T01], REGISTRY, { name: NAME })), 'INFO');
    expect(textAt(info, 'NAME')).toBe(NAME);
    expect(textAt(info, 'ALLOWDUPLICATEDENTRIES')).toBe('0');
    expect(textAt(info, 'DISPLAYFORMAT')).toBe('dictionary');
    expect(textAt(info, 'DEFAULTAPPROVAL')).toBe('1');
    expect(textAt(info, 'GLOBALGLOSSARY')).toBe('0');
    expect(textAt(info, 'INTRO')).toBe('');
  });

  it('експорт однієї теми без посилань назовні', () => {
    const plan = planGlossaryExport([T01], REGISTRY, { name: 'Глосарій теми' });
    expect(describeGlossaryPlan(plan)).toEqual({
      total: 2,
      categories: ['Тема 01. Корпорація'],
      entries: [
        { concept: 'Корпорація', aliases: ['корпоративне підприємство'], categories: ['Тема 01. Корпорація'] },
        { concept: 'Агентська проблема', aliases: [], categories: ['Тема 01. Корпорація'] },
      ],
    });
  });
});

describe('перевірки глосарію', () => {
  it('незареєстрована тема, дублікати ID і назв, кілька файлів на тему, невідомий seeAlso', () => {
    const unknownTopic = file({ topic: 't09', terms: [{ id: 'esg', term: 'ESG', definition: 'Стійкість.' }] });
    const duplicate = file({
      topic: 't01',
      terms: [
        { id: 'corporation', term: 'корпорація', definition: 'Повтор.' },
        { id: 'unknown-link', term: 'Інший', definition: 'Текст.', seeAlso: ['no-such-term'] },
      ],
    });
    expect(findGlossaryProblems([T01, unknownTopic, duplicate], REGISTRY)).toEqual([
      'Глосарій теми «t09»: тему не зареєстровано в course.yaml',
      'Тема t01 має більше одного файлу глосарію',
      'Дублікат ID терміна «corporation»',
      'Термін «корпорація» визначено двічі',
      'Термін «unknown-link» посилається в seeAlso на невідомий термін «no-such-term»',
    ]);
  });

  it('назва терміна з іншої теми береться з реєстру course.yaml, навіть якщо її файл не експортують', () => {
    const withRegistry = { ...REGISTRY, glossaryTerms: [{ id: 'dividend', term: 'Дивіденд' }] };
    const plan = planGlossaryExport([T01], withRegistry, {
      name: NAME,
      references: [file({ topic: 't01', terms: [{ id: 'agency-problem', term: 'Агентська проблема', definition: 'Конфлікт.' }] })],
    });
    expect(plan.entries[0]?.definitionHtml).toContain('Див. також: Агентська проблема.');
    const cross = planGlossaryExport(
      [file({ topic: 't01', terms: [{ id: 'corporation', term: 'Корпорація', definition: 'Опис.', seeAlso: ['dividend'] }] })],
      withRegistry,
      { name: NAME },
    );
    expect(cross.entries[0]?.definitionHtml).toContain('Див. також: Дивіденд.');
  });

  it('planGlossaryExport кидає ExportError', () => {
    const orphan = file({ topic: 't02', terms: [{ id: 'model', term: 'Модель', definition: 'Опис.', seeAlso: ['dividend'] }] });
    expect(() => planGlossaryExport([orphan], REGISTRY, { name: NAME })).toThrow(ExportError);
    expect(planGlossaryExport([orphan], REGISTRY, { name: NAME, references: [orphan, T07] }).entries[0]?.definitionHtml).toContain(
      'Див. також: Дивіденд.',
    );
  });
});
