import type { GlossaryFile, GlossaryTerm } from '../../src/content/schemas/glossary.ts';
import { findDuplicates, normalizeText } from '../../src/content/schemas/primitives.ts';
import { indexTopics, throwIfProblems, topicCategoryName, type CourseRegistry } from './registry.ts';
import { escapeHtml, htmlText, typoPlain } from './text.ts';
import { cdataElement, element, serializeXml, textElement, type XmlElement } from './xml.ts';

/**
 * Глосарій теми, модуля або курсу → XML для «Імпорт записів» модуля Moodle «Глосарій» (mod/glossary/import.php),
 * у форматі, доведеному `tools/moodle/fixtures/glossary-entries.xml`. Категорія запису — тема
 * («Тема 01. Назва», викладач ставить «Імпортувати категорії»), синоніми — ключові слова (ALIASES).
 * Записи не потрапляють у .mbz без даних користувачів, тому цей файл викладач імпортує окремо.
 */

export interface GlossaryExportOptions {
  /** Назва глосарію, якщо викладач імпортує в новий глосарій. */
  readonly name: string;
  /** Файли, у яких шукати терміни з seeAlso (типово — ті самі, що експортуються). */
  readonly references?: readonly GlossaryFile[];
}

export interface PlannedGlossaryEntry {
  readonly id: string;
  readonly concept: string;
  readonly definitionHtml: string;
  readonly aliases: readonly string[];
  readonly categories: readonly string[];
}

export interface GlossaryExportPlan {
  readonly name: string;
  readonly entries: readonly PlannedGlossaryEntry[];
}

/** Назви термінів для «Див. також»: спершу з файлів, які експортуємо, потім із реєстру course.yaml. */
function indexConcepts(course: CourseRegistry, references: readonly GlossaryFile[]): ReadonlyMap<string, string> {
  return new Map([
    ...(course.glossaryTerms ?? []).map((term) => [term.id, typoPlain(term.term)] as const),
    ...references.flatMap((file) => file.terms.map((term) => [term.id, typoPlain(term.term)] as const)),
  ]);
}

export function findGlossaryProblems(
  files: readonly GlossaryFile[],
  course: CourseRegistry,
  references: readonly GlossaryFile[] = files,
): string[] {
  const topics = indexTopics(course);
  const terms = files.flatMap((file) => file.terms);
  const known = indexConcepts(course, references);
  return [
    ...files.filter((file) => !topics.has(file.topic)).map((file) => `Глосарій теми «${file.topic}»: тему не зареєстровано в course.yaml`),
    ...findDuplicates(files.map((file) => file.topic)).map((topic) => `Тема ${topic} має більше одного файлу глосарію`),
    ...findDuplicates(terms.map((term) => term.id)).map((id) => `Дублікат ID терміна «${id}»`),
    // Moodle відхиляє записи з однаковою назвою (без урахування регістру), якщо дублікати заборонено.
    ...findDuplicates(terms.map((term) => normalizeText(typoPlain(term.term)))).map((term) => `Термін «${term}» визначено двічі`),
    ...terms.flatMap((term) =>
      term.seeAlso.filter((id) => !known.has(id)).map((id) => `Термін «${term.id}» посилається в seeAlso на невідомий термін «${id}»`),
    ),
  ];
}

function definitionHtml(term: GlossaryTerm, conceptById: ReadonlyMap<string, string>): string {
  const related = term.seeAlso.flatMap((id) => {
    const concept = conceptById.get(id);
    return concept === undefined ? [] : [concept];
  });
  const seeAlso = related.length > 0 ? `<p>Див. також: ${escapeHtml(related.join(', '))}.</p>` : '';
  return `${htmlText(term.definition)}${seeAlso}`;
}

/** Порядок записів — порядок тем у реєстрі, усередині теми — порядок у файлі. */
export function planGlossaryExport(
  files: readonly GlossaryFile[],
  course: CourseRegistry,
  options: GlossaryExportOptions,
): GlossaryExportPlan {
  const references = options.references ?? files;
  throwIfProblems(findGlossaryProblems(files, course, references));
  const topics = indexTopics(course);
  const conceptById = indexConcepts(course, references);
  const ordered = [...files].sort((a, b) => (topics.get(a.topic)?.order ?? 0) - (topics.get(b.topic)?.order ?? 0));
  const entries = ordered.flatMap((file) => {
    const place = topics.get(file.topic);
    const categories = place ? [topicCategoryName(place.topic)] : [];
    return file.terms.map((term) => ({
      id: term.id,
      concept: typoPlain(term.term),
      definitionHtml: definitionHtml(term, conceptById),
      aliases: [...new Set(term.synonyms.map(typoPlain))],
      categories,
    }));
  });
  return { name: typoPlain(options.name), entries };
}

function entryElement(entry: PlannedGlossaryEntry): XmlElement {
  return element('ENTRY', [
    cdataElement('CONCEPT', entry.concept),
    cdataElement('DEFINITION', entry.definitionHtml),
    textElement('FORMAT', '1'),
    textElement('USEDYNALINK', '0'),
    textElement('CASESENSITIVE', '0'),
    textElement('FULLMATCH', '1'),
    textElement('TEACHERENTRY', '1'),
    ...(entry.aliases.length > 0
      ? [element('ALIASES', entry.aliases.map((alias) => element('ALIAS', [cdataElement('NAME', alias)])))]
      : []),
    ...(entry.categories.length > 0
      ? [
          element(
            'CATEGORIES',
            entry.categories.map((name) => element('CATEGORY', [cdataElement('NAME', name), textElement('USEDYNALINK', '0')])),
          ),
        ]
      : []),
  ]);
}

export function renderGlossaryPlan(plan: GlossaryExportPlan): string {
  const info = element('INFO', [
    cdataElement('NAME', plan.name),
    textElement('INTRO', ''),
    textElement('INTROFORMAT', '1'),
    textElement('ALLOWDUPLICATEDENTRIES', '0'),
    textElement('DISPLAYFORMAT', 'dictionary'),
    textElement('SHOWSPECIAL', '1'),
    textElement('SHOWALPHABET', '1'),
    textElement('SHOWALL', '1'),
    textElement('ALLOWCOMMENTS', '0'),
    textElement('USEDYNALINK', '0'),
    textElement('DEFAULTAPPROVAL', '1'),
    textElement('GLOBALGLOSSARY', '0'),
    textElement('ENTBYPAGE', '10'),
    element('ENTRIES', plan.entries.map(entryElement)),
  ]);
  return serializeXml(element('GLOSSARY', [info]), {
    comment: 'Записи глосарію для «Імпорт записів» Moodle. Згенеровано tools/export/glossary-xml.ts, не редагуйте вручну.',
  });
}

export function glossaryToMoodleXml(files: readonly GlossaryFile[], course: CourseRegistry, options: GlossaryExportOptions): string {
  return renderGlossaryPlan(planGlossaryExport(files, course, options));
}

export interface GlossaryManifest {
  readonly total: number;
  readonly categories: readonly string[];
  readonly entries: ReadonlyArray<Pick<PlannedGlossaryEntry, 'concept' | 'aliases' | 'categories'>>;
}

export function describeGlossaryPlan(plan: GlossaryExportPlan): GlossaryManifest {
  return {
    total: plan.entries.length,
    categories: [...new Set(plan.entries.flatMap((entry) => entry.categories))],
    entries: plan.entries.map(({ concept, aliases, categories }) => ({ concept, aliases, categories })),
  };
}
