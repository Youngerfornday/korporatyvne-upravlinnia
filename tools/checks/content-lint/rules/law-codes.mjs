/**
 * Правило 2. Коди норм.
 * Кожен код рядка (AT-01, RK-13, UBO-03) з lawRef і з приміток «legal-baseline …» має існувати в базі,
 * а номери статей у посиланні — збігатися з тим, що записано в базі для цього коду.
 */
import { articleNumbers } from '../baseline.mjs';
import { refineLine } from '../content.mjs';
import { ERROR, makeFinding } from '../finding.mjs';
import { baselineMentionsIn, codesIn, lawRefsOf } from '../refs.mjs';
import { quote } from '../text.mjs';

export const RULE = 'law-code';
const UNKNOWN_HINT = 'Звіртеся з docs/research/legal-baseline.md: код рядка пишеться як у базі (AT-01, RK-13). Якщо норми в базі немає — спершу доповніть базу першоджерелом.';
const ARTICLE_HINT = 'Приведіть статтю у відповідність до рядка бази або візьміть код того рядка, який справді описує цю статтю.';

function knownPrefixes(baseline) {
  return new Set([...baseline.codes.keys()].map((code) => code.slice(0, code.lastIndexOf('-'))));
}

/**
 * Одне посилання може вказувати кілька кодів одразу («ст. 1 …; ст. 5-1 … (UBO-01, UBO-02)»),
 * тому стаття звіряється з об'єднанням статей усіх названих кодів.
 */
function articleIssues(file, ref, baseline) {
  const entries = ref.codes.map((code) => baseline.codes.get(code)).filter((entry) => entry !== undefined);
  const known = new Set(entries.flatMap((entry) => [...entry.articles]));
  const used = [...articleNumbers(ref.article)];
  if (entries.length === 0 || used.length === 0 || known.size === 0) return [];
  const unknown = used.filter((number) => !known.has(number));
  if (unknown.length === 0) return [];
  const described = entries.map((entry) => `${entry.code} — «${quote(entry.article, 60)}»`).join('; ');
  return [makeFinding({
    file: file.file, line: ref.articleLine, rule: RULE, level: ERROR,
    message: `Стаття ${unknown.map((number) => `ст. ${number}`).join(', ')} не належить коду з legal-baseline.md (${described})`,
    hint: ARTICLE_HINT,
    quote: quote(ref.article),
  })];
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {ReturnType<import('../baseline.mjs').parseBaseline>} baseline
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkLawCodes(files, baseline) {
  const prefixes = knownPrefixes(baseline);
  return files.flatMap((file) => {
    const refs = lawRefsOf(file);
    const fromLawRefs = refs.flatMap((ref) => [
      ...ref.codes
        .filter((code) => !baseline.codes.has(code))
        .map((code) => makeFinding({
          file: file.file, line: ref.articleLine, rule: RULE, level: ERROR,
          message: `Код норми «${code}» не знайдено в docs/research/legal-baseline.md`,
          hint: UNKNOWN_HINT,
          quote: quote(ref.article),
        })),
      ...articleIssues(file, ref, baseline),
    ]);

    // Рядки самих lawRef уже перевірено вище — у прозі шукаються згадки поза ними.
    const inLawRef = (line) => refs.some((ref) => line >= ref.line && line <= ref.endLine);
    const fromProse = file.units.filter((unit) => !inLawRef(unit.line)).flatMap((unit) => {
      const mentioned = new Set([
        ...baselineMentionsIn(unit.text),
        ...codesIn(unit.text).filter((code) => prefixes.has(code.slice(0, code.lastIndexOf('-')))),
      ]);
      return [...mentioned]
        .filter((code) => !baseline.codes.has(code))
        .map((code) => makeFinding({
          file: file.file, line: refineLine(file, unit, code), rule: RULE, level: ERROR,
          message: `Код норми «${code}» не знайдено в docs/research/legal-baseline.md`,
          hint: UNKNOWN_HINT,
          quote: quote(unit.text),
        }));
    });
    return [...fromLawRefs, ...fromProse];
  });
}
