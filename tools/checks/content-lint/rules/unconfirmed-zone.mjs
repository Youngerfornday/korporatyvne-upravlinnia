/**
 * Правило 3. Заборонена зона.
 * Розділ «Не підтверджено / потребує звірки викладачем» у legal-baseline.md — заборонена зона:
 * якщо речення з маркером норми («стаття», «ст.», «закон», «кодекс», «вимагає», «зобов'язаний»)
 * описує сутність із цього розділу, лінт попереджає і цитує пункт бази.
 */
import { refineLine } from '../content.mjs';
import { WARNING, makeFinding } from '../finding.mjs';
import { hasAllStems, lower, quote, splitSentences } from '../text.mjs';

export const RULE = 'unconfirmed-zone';
const HINT = 'Або приберіть нормативне твердження, або спершу звірте пункт і перенесіть його з розділу «Не підтверджено» в основну частину legal-baseline.md з кодом рядка.';
const NORM_MARKERS = ['статт', 'закон', 'кодекс', 'вимага', 'зобов’яз', 'ст. '];
const EXEMPT_KEYS = new Set(['caveat']);
/** Пункт без власних основ (надто короткий заголовок) не перевіряється: він збігався б з будь-чим. */
const MIN_STEMS = 2;

export function hasNormMarker(sentence) {
  const text = lower(sentence);
  return NORM_MARKERS.some((marker) => text.includes(marker));
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {ReturnType<import('../baseline.mjs').parseBaseline>} baseline
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkUnconfirmedZone(files, baseline) {
  const items = baseline.unconfirmed.filter((item) => item.stems.length >= MIN_STEMS);
  return files.flatMap((file) =>
    file.units.flatMap((unit) => {
      if (unit.key !== null && EXEMPT_KEYS.has(unit.key)) return [];
      return splitSentences(unit.text).flatMap((sentence) => {
        if (!hasNormMarker(sentence)) return [];
        return items
          .filter((item) => hasAllStems(sentence, item.stems))
          .map((item) => makeFinding({
            file: file.file, line: refineLine(file, unit, sentence.slice(0, 40)), rule: RULE, level: WARNING,
            message: `Твердження з маркером норми торкається пункту ${item.number} розділу «Не підтверджено»: «${quote(item.title, 90)}»`,
            hint: `${HINT} Пункт бази: «${quote(item.text, 220)}»`,
            quote: quote(sentence),
          }));
      });
    }),
  );
}
