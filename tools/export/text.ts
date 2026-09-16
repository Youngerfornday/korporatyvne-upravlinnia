import { MOODLE_GRADE_PERCENTS } from '../../src/content/schemas/questions.ts';
import { normalizeTypography } from '../../src/lib/typography/normalize.ts';

/**
 * Перетворення тексту банку для Moodle: типографіка, HTML, назви питань, числа з крапкою.
 * Тексти в YAML — звичайний текст; порожній рядок ділить абзаци, одиночний перенос — `<br>`.
 */

/** Допуск збігу оцінки з варіантом Moodle — той самий, що в схемі банку (відсотки). */
const GRADE_TOLERANCE = 0.001;
const NAME_MAX_WORDS = 10;
const NAME_MAX_LENGTH = 80;
const ELLIPSIS = '…';

/** Текст для показу: апостроф, лапки, тире й нерозривні пробіли. */
export function typo(text: string): string {
  return normalizeTypography(text.trim());
}

/**
 * Текст, який порівнюють або шукають (назви, категорії, терміни, короткі відповіді): без нерозривних пробілів,
 * бо користувач набирає звичайні.
 */
export function typoPlain(text: string): string {
  return normalizeTypography(text.trim(), { nbsp: false });
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Абзаци `<p>` з уже нормалізованого тексту; кожен рядок проходить через `renderLine` (типово — екранування HTML). */
export function toHtmlParagraphs(text: string, renderLine: (line: string) => string = escapeHtml): string {
  return text
    .trim()
    .split(/\n[ \t]*\n\s*/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${paragraph.split('\n').map((line) => renderLine(line.trim())).join('<br>')}</p>`)
    .join('');
}

/** Текст → HTML з типографікою: стовбури й відгуки. */
export function htmlText(text: string): string {
  return toHtmlParagraphs(typo(text));
}

/** Короткий текст без абзаців (варіанти відповіді, елементи відповідності). */
export function inlineHtml(text: string): string {
  return escapeHtml(typo(text).replace(/\s*\n\s*/g, ' '));
}

/**
 * Стисла назва питання: перші слова стовбура без міток пропусків. Стовбур — звичайний текст, тож `<` і `>`
 * кодуються сутностями: Moodle чистить назву через strip_tags (PARAM_TEXT) і показує її через format_string.
 */
export function questionName(stem: string): string {
  const plain = typoPlain(stem.replace(/\{#\d+\}|\[\[\d+\]\]/g, ELLIPSIS))
    .replace(/\s+/g, ' ')
    .trim();
  const words = plain.split(' ');
  const firstWords = words.slice(0, NAME_MAX_WORDS).join(' ');
  const clipped = firstWords.length <= NAME_MAX_LENGTH ? firstWords : cutAtWord(firstWords, NAME_MAX_LENGTH);
  const name =
    words.length <= NAME_MAX_WORDS && firstWords.length <= NAME_MAX_LENGTH
      ? firstWords
      : `${clipped.replace(/[\s,.;:!?—–-]+$/, '')}${ELLIPSIS}`;
  return name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cutAtWord(text: string, maxLength: number): string {
  const hard = text.slice(0, maxLength);
  const atWord = hard.replace(/\s+\S*$/, '');
  return atWord === '' ? hard : atWord;
}

/** Число для Moodle XML: завжди з крапкою і без експоненти. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Число для Moodle має бути скінченним, отримано ${value}`);
  if (Object.is(value, -0)) return '0';
  const plain = String(value);
  return /e/i.test(plain) ? value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 100 }) : plain;
}

/**
 * Оцінка варіанта у відсотках → канонічне значення зі списку Moodle (33.33333, а не 33.333),
 * бо імпорт іде з matchgrades=error і порівнює частки з точністю 0,00001.
 */
export function formatFraction(percent: number): string {
  const grade = MOODLE_GRADE_PERCENTS.find((option) => Math.abs(Math.abs(percent) - option) < GRADE_TOLERANCE);
  if (grade === undefined) throw new Error(`Оцінка ${percent}% не входить до списку Moodle`);
  return formatNumber(grade === 0 ? 0 : Math.sign(percent) * grade);
}
