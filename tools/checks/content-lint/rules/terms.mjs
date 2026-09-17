/**
 * Правило 7. Терміни.
 * `<Term id="…">` у лекції вводить термін: id має бути в реєстрі course.yaml, належати темі цієї лекції
 * і мати визначення в її glossary.yaml. Доповнює перевірку цілісності, яка звіряє лише frontmatter і глосарії.
 */
import { ERROR, WARNING, makeFinding } from '../finding.mjs';

export const RULE = 'term';
const FOREIGN_HINT = 'Терміни вводить тема-власник: або перенесіть термін у реєстр цієї теми, або згадайте поняття звичайним текстом з посиланням на тему, де його визначено.';
const UNKNOWN_HINT = 'Додайте термін до реєстру course.yaml (glossaryTerms) і до glossary.yaml теми або виправте id.';
const MISSING_HINT = 'Додайте визначення до glossary.yaml теми: без нього компонент показує «Визначення ще не додано».';
const KEY_TERM_HINT = 'Додайте id до keyTerms у frontmatter лекції — це перелік термінів, які тема вводить.';

const TERM_TAG = /<Term\s[^>]*id="([a-z0-9-]+)"/g;
const TOPIC_FOLDER = /(?:^|\/)modules\/(m\d+)\/(t\d{2})\//;

/** @returns {{ id: string, line: number }[]} */
export function termUsages(file) {
  return file.lines.flatMap((line, index) => [...line.matchAll(TERM_TAG)].map(([, id]) => ({ id, line: index + 1 })));
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {{ glossaryTerms: Array<{ id: string, topic: string }> }} course
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkTerms(files, course) {
  const registry = new Map((course.glossaryTerms ?? []).map((term) => [term.id, term.topic]));
  const glossaries = new Map(
    files
      .filter((file) => Array.isArray(file.data?.terms) && file.data?.topic)
      .map((file) => [String(file.data.topic), new Set(file.data.terms.map((term) => String(term.id)))]),
  );

  const lectures = files.filter((file) => file.kind === 'mdx' && TOPIC_FOLDER.test(file.file));
  const inLectures = lectures.flatMap((file) => {
    const topic = String(file.data?.id ?? TOPIC_FOLDER.exec(file.file)?.[2] ?? '');
    const keyTerms = new Set((file.data?.keyTerms ?? []).map(String));
    const defined = glossaries.get(topic) ?? new Set();
    return termUsages(file).flatMap(({ id, line }) => {
      const owner = registry.get(id);
      if (owner === undefined) {
        return [makeFinding({ file: file.file, line, rule: RULE, level: ERROR, message: `Термін «${id}» не зареєстровано в course.yaml`, hint: UNKNOWN_HINT })];
      }
      if (owner !== topic) {
        return [makeFinding({ file: file.file, line, rule: RULE, level: ERROR, message: `Термін «${id}» зареєстровано за темою ${owner}, а <Term> вводить його в лекції теми ${topic}`, hint: FOREIGN_HINT })];
      }
      return [
        ...(defined.has(id) ? [] : [makeFinding({ file: file.file, line, rule: RULE, level: ERROR, message: `Термін «${id}» не має визначення в glossary.yaml теми ${topic}`, hint: MISSING_HINT })]),
        ...(keyTerms.has(id) ? [] : [makeFinding({ file: file.file, line, rule: RULE, level: WARNING, message: `Термін «${id}» вводиться через <Term>, але його немає в keyTerms лекції`, hint: KEY_TERM_HINT })]),
      ];
    });
  });

  const inPracticals = files.flatMap((file) =>
    file.units
      .filter((unit) => unit.key === 'term' && unit.path.includes('models'))
      .filter((unit) => !registry.has(unit.text.trim()))
      .map((unit) => makeFinding({ file: file.file, line: unit.line, rule: RULE, level: ERROR, message: `Термін «${unit.text.trim()}» не зареєстровано в course.yaml`, hint: UNKNOWN_HINT })),
  );

  return [...inLectures, ...inPracticals];
}
