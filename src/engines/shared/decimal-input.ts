/**
 * Розбір числа, введеного людиною, за правилами Moodle 5.2
 * (`qtype_numerical_answer_processor::apply_units`, question/type/numerical/questiontype.php):
 * - пробіли прибираються (це можуть бути розділювачі тисяч);
 * - `e`, `x10^`, `*10**`, `×10^` перед показником зводяться до `e`;
 * - якщо є крапка або кілька ком — коми вважаються розділювачами тисяч і прибираються;
 *   інакше кома — десятковий знак («1,5» = 1.5, але «1,234» = 1.234);
 * - число читається з початку рядка, решта — «одиниця виміру».
 *
 * Відмінність від Moodle: окрім звичайного пробілу прибираємо ще нерозривний (U+00A0),
 * вузький нерозривний (U+202F) і тонкий (U+2009) — їх ставить `Intl.NumberFormat('uk-UA')`,
 * тож число, скопійоване із сайту, має читатися. Moodle прибирає лише пробіл і розділювач
 * тисяч мовного пакета.
 */
export interface ParsedNumber {
  /** Значення або null, якщо на початку рядка немає числа. */
  readonly value: number | null;
  /** Текст після числа (у Moodle — одиниця виміру). */
  readonly rest: string;
}

const SPACES = /[ \u00A0\u202F\u2009]/g;
const EXPONENT_FORMS = /(?:e|E|(?:x|\*|×)10(?:\^|\*\*))([+-]?\d+)/g;
const NUMBER_AT_START = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/;

export function parseMoodleNumber(input: string): ParsedNumber {
  if (input.trim() === '') return { value: null, rest: '' };

  let text = input.replace(SPACES, '').replace(EXPONENT_FORMS, 'e$1');
  const commaCount = text.split(',').length - 1;
  text = text.includes('.') || commaCount > 1 ? text.replaceAll(',', '') : text.replaceAll(',', '.');

  const match = NUMBER_AT_START.exec(text);
  if (!match) return { value: null, rest: text };
  return { value: Number(match[0]), rest: text.slice(match[0].length) };
}

/** Суворий варіант для калькуляторів: лише скінченне число без зайвого тексту. */
export function parseDecimalInput(input: string): number | null {
  const { value, rest } = parseMoodleNumber(input);
  if (value === null || rest !== '' || !Number.isFinite(value)) return null;
  return value;
}
