/**
 * Збірка правил лінту контенту в один прогін.
 * Вхід — розібрані файли content/ і legal-baseline.md; вихід — плоский список знахідок.
 * Правила незалежні: кожне можна викликати окремо (і так вони й тестуються).
 */
import { checkCaseCaveats } from './rules/case-caveats.mjs';
import { checkCheckedDates, todayIso } from './rules/checked-dates.mjs';
import { checkLawCodes } from './rules/law-codes.mjs';
import { checkLawNumbers } from './rules/law-numbers.mjs';
import { checkNumbersWithoutSource } from './rules/numbers.mjs';
import { checkSlides } from './rules/slides.mjs';
import { checkSourceUsage } from './rules/sources.mjs';
import { checkSvgSafety } from './rules/svg-safety.mjs';
import { checkTerms } from './rules/terms.mjs';
import { checkUnconfirmedZone } from './rules/unconfirmed-zone.mjs';

/**
 * @param {{ files: import('./content.mjs').ContentFile[], baseline: ReturnType<import('./baseline.mjs').parseBaseline>, course: object, today?: string }} input
 * @returns {import('./finding.mjs').Finding[]}
 */
export function lintContent({ files, baseline, course, today = todayIso() }) {
  return [
    ...checkLawNumbers(files, baseline),
    ...checkLawCodes(files, baseline),
    ...checkUnconfirmedZone(files, baseline),
    ...checkCheckedDates(files, baseline, today),
    ...checkCaseCaveats(files, course?.cases ?? []),
    ...checkSourceUsage(files),
    ...checkTerms(files, course ?? { glossaryTerms: [] }),
    ...checkNumbersWithoutSource(files),
    ...checkSlides(files, course ?? {}),
    ...checkSvgSafety(files),
  ];
}
