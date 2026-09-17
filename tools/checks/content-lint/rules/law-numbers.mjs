/**
 * Правило 1. Номери законів.
 * Кожна згадка «Закон № 1234-IX» у контенті має існувати в docs/research/legal-baseline.md.
 * Виняток — поле `caveat` кейсу і згадка, що в базі є лише в розділі «Не підтверджено»
 * (там норму ще не звірено, тож згадка можлива, але з попередженням).
 */
import { LAW_MENTION, URL_IN_TEXT } from '../baseline.mjs';
import { refineLine } from '../content.mjs';
import { ERROR, WARNING, makeFinding } from '../finding.mjs';
import { quoteAround } from '../text.mjs';

export const RULE = 'law-number';
const HINT = 'Додайте акт до docs/research/legal-baseline.md разом з першоджерелом і кодом рядка — і лише тоді посилайтеся на нього; якщо це непідтверджений факт кейсу, його місце в полі caveat реєстру course.yaml.';
const EXEMPT_KEYS = new Set(['caveat']);

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {ReturnType<import('../baseline.mjs').parseBaseline>} baseline
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkLawNumbers(files, baseline) {
  return files.flatMap((file) =>
    file.units.flatMap((unit) => {
      if (unit.key !== null && EXEMPT_KEYS.has(unit.key)) return [];
      const seen = new Set();
      const text = unit.text.replace(URL_IN_TEXT, ' ');
      return [...text.matchAll(LAW_MENTION)].flatMap(([, raw]) => {
        const number = raw.toUpperCase();
        if (seen.has(number)) return [];
        seen.add(number);
        const known = baseline.laws.get(number);
        if (known?.confirmed) return [];
        const line = refineLine(file, unit, raw);
        if (known) {
          return [makeFinding({
            file: file.file, line, rule: RULE, level: WARNING,
            message: `Закон № ${number} є в legal-baseline.md лише в розділі «Не підтверджено» — норма ще не звірена`,
            hint: HINT,
            quote: quoteAround(unit.text, raw),
          })];
        }
        return [makeFinding({
          file: file.file, line, rule: RULE, level: ERROR,
          message: `Закон № ${number} не знайдено в docs/research/legal-baseline.md`,
          hint: HINT,
          quote: quoteAround(unit.text, raw),
        })];
      });
    }),
  );
}
