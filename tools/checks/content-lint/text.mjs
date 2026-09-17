/**
 * Текстові примітиви лінту контенту: нормалізація, стемінг, поділ на речення, цитати.
 * Морфології тут немає: українські слова порівнюються за основою (перші літери),
 * бо правила шукають згадку сутності, а не точну словоформу.
 */

/** Скорочення, після яких крапка не завершує речення. */
const ABBREVIATIONS = new Set([
  'ст', 'стст', 'ч', 'п', 'пп', 'абз', 'розд', 'гл', 'див', 'напр', 'зокрема',
  'р', 'рр', 'ст-тя', 'грн', 'дол', 'євро', 'млн', 'млрд', 'тис', 'коп',
  'ім', 'проф', 'акад', 'вид', 'вип', 'с', 'т', 'ін', 'та', 'н',
]);

const WORD = /[\p{L}\p{N}’-]+/gu;
const STEM_LENGTH = 6;
const MIN_STEM_WORD = 5;
const MIN_ABBREVIATION = 3;
const MIN_NUMBER = 3;

/** Єдиний апостроф і пробіли: порівняння не має залежати від того, який знак набрав автор. */
export function normalizeText(text) {
  return text.replace(/[’'ʼ`´]/g, '’').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export function lower(text) {
  return normalizeText(text).toLocaleLowerCase('uk-UA');
}

/** Основа слова для пошуку згадки: «директорів» і «директори» дають «директ». */
export function stem(word) {
  return lower(word).slice(0, STEM_LENGTH);
}

/**
 * Значущі основи фрази: довгі слова — основою, абревіатури, латиниця й числа (роки, номери) — цілком.
 * Короткі службові слова й дволітерні скорочення відкидаються: вони є в будь-якому реченні.
 */
export function signatureStems(phrase) {
  const found = [];
  for (const [word] of normalizeText(phrase).matchAll(WORD)) {
    const isNumber = /^\d+$/.test(word);
    const isAbbreviation = !isNumber && word === word.toLocaleUpperCase('uk-UA') && /\p{L}/u.test(word);
    if (isNumber) {
      if (word.length >= MIN_NUMBER) found.push(word);
    } else if (isAbbreviation) {
      if (word.length >= MIN_ABBREVIATION) found.push(lower(word));
    } else if (word.length >= MIN_STEM_WORD) {
      found.push(stem(word));
    }
  }
  return [...new Set(found)];
}

/** Чи містить текст усі основи (у будь-якій словоформі). */
export function hasAllStems(text, stems) {
  if (stems.length === 0) return false;
  const haystack = lower(text);
  return stems.every((item) => haystack.includes(item));
}

/** Чи містить текст хоч одну основу. */
export function hasAnyStem(text, stems) {
  const haystack = lower(text);
  return stems.some((item) => item !== '' && haystack.includes(item));
}

/**
 * Поділ на речення з урахуванням скорочень («ст. 6 ч. 1», «1932 р.») і дат («12.03.2020»).
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const source = normalizeText(text);
  const boundary = /([.!?…])(["»”)\]]*)(\s+)/g;
  const sentences = [];
  let start = 0;
  for (const match of source.matchAll(boundary)) {
    const before = source.slice(start, match.index);
    const lastWord = /([\p{L}\p{N}’-]+)$/u.exec(before)?.[1] ?? '';
    const isAbbreviation = ABBREVIATIONS.has(lower(lastWord)) || /^\d+$/.test(lastWord) || lastWord.length === 1;
    if (isAbbreviation) continue;
    const end = match.index + match[1].length + match[2].length;
    sentences.push(source.slice(start, end).trim());
    start = end + match[3].length;
  }
  const tail = source.slice(start).trim();
  if (tail !== '') sentences.push(tail);
  return sentences.filter((sentence) => sentence !== '');
}

/**
 * Речення на частини: крапка з комою, тире й двокрапка розділяють самостійні твердження.
 * Правила про причинний зв’язок дивляться саме на частину — інакше «Toyota …; … проходить через комітет»
 * виглядало б як причинний зв’язок між сусідніми, але не пов’язаними твердженнями.
 */
export function splitClauses(sentence) {
  return normalizeText(sentence)
    .split(/\s*[;:]\s*|\s+[—–]\s+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== '');
}

const QUOTE_LIMIT = 160;

/** Коротка цитата для звіту: без переносів, з трьома крапками замість хвоста. */
export function quote(text, limit = QUOTE_LIMIT) {
  const clean = normalizeText(text);
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

/** Фрагмент навколо знахідки: показує, у якому оточенні вжито знайдене. */
export function quoteAround(text, needle, limit = QUOTE_LIMIT) {
  const clean = normalizeText(text);
  const at = clean.toLocaleLowerCase('uk-UA').indexOf(lower(needle));
  if (at < 0 || clean.length <= limit) return quote(clean, limit);
  const from = Math.max(0, at - Math.floor((limit - needle.length) / 2));
  const slice = clean.slice(from, from + limit);
  return `${from > 0 ? '…' : ''}${slice.trim()}${from + limit < clean.length ? '…' : ''}`;
}
