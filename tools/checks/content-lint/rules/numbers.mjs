/**
 * Правило 8. Числа без джерела (евристика, рівень попередження).
 * Речення з відсотком, грошовою сумою чи співвідношенням «N з M», якщо в межах абзацу
 * (або мапи YAML) немає ні `source:`, ні коду норми, ні адреси, ні звороту зі згадкою джерела.
 */
import { refineLine } from '../content.mjs';
import { WARNING, makeFinding } from '../finding.mjs';
import { lower, quote, splitSentences } from '../text.mjs';

export const RULE = 'number-without-source';
const HINT = 'Додайте поруч джерело: `source:` у YAML, код рядка legal-baseline, посилання або зворот «за даними …» — число без джерела не можна перевірити.';

const PERCENT = /\d[\d\s .,]*\s?%/;
const MONEY = /\d[\d\s .,]*\s*(?:грн|дол\.?|євро|usd|eur|млн|млрд|тис\.?)/i;
const RATIO = /\b\d{1,4}\s+з\s+\d{1,4}\b/;
const SOURCE_MARKERS = ['source:', 'alsosources', '#src-', 'http', 'legal-baseline', 'lawref', 'checkedat', 'ref:', 'за даними', 'за позицією', 'за оцінк', 'за словами', 'позиці', 'згідно з', 'відповідно до', 'джерел', 'звіт', 'повідоми', 'оприлюдни', 'назвала', 'встановив', 'ст. ', 'статт'];
const CODE = /\b[A-Z]{2,4}(?:-[A-Z]{2})?-\d{2}\b/;
const SKIP_KEYS = new Set(['url', 'id', 'checkedAt', 'updatedAt', 'source']);
/**
 * Числа навчального дизайну — не факти із зовнішніх джерел: бали й пороги рубрик, години, схема оцінювання,
 * а також вигадані дані обчислювальних питань (`type: numerical`). Їх правило не чіпає.
 */
const SKIP_PATHS = new Set(['rubric', 'levels', 'grading', 'assessment', 'calendar', 'hours', 'policies', 'literature']);
const COMPUTED_QUESTION = /^\s*type:\s*(numerical|calculated)\s*$/m;

export function hasNumericFact(sentence) {
  return PERCENT.test(sentence) || MONEY.test(sentence) || RATIO.test(sentence);
}

export function hasSourceMarker(text) {
  const haystack = lower(text);
  return CODE.test(text) || SOURCE_MARKERS.some((marker) => haystack.includes(marker));
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkNumbersWithoutSource(files) {
  return files.flatMap((file) =>
    file.units.flatMap((unit) => {
      if (unit.key !== null && SKIP_KEYS.has(unit.key)) return [];
      if (unit.path.some((step) => SKIP_PATHS.has(step))) return [];
      if (COMPUTED_QUESTION.test(unit.record)) return [];
      if (hasSourceMarker(unit.record)) return [];
      return splitSentences(unit.text)
        .filter(hasNumericFact)
        .map((sentence) => makeFinding({
          file: file.file, line: refineLine(file, unit, sentence.slice(0, 40)), rule: RULE, level: WARNING,
          message: 'Число в тексті не має джерела в межах абзацу',
          hint: HINT,
          quote: quote(sentence),
        }));
    }),
  );
}
