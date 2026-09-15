/**
 * Чисті функції лінту типографіки: знаходять у YAML і MDX рядки, які змінила б normalizeTypography.
 * Ядро правил — src/lib/typography/normalize.ts (Node ≥ 22.18 стирає типи без збірки).
 *
 * Типово перевіряються видимі знаки (апостроф, лапки, тире, три крапки): їх автор має писати правильно в джерелі,
 * бо джерело йде й в експортери. Нерозривні пробіли ставить рендер (hast-плагін для MDX, typo() у шаблонах),
 * тому в джерелі вони перевіряються лише в суворому режимі `{ nbsp: true }` (прапорець --nbsp).
 */
import { LineCounter, isScalar, parseDocument, visit } from 'yaml';
import { normalizeTypography } from '../../src/lib/typography/normalize.ts';

/** @typedef {{ line: number, actual: string, expected: string }} Finding */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FENCE = /^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*$/gm;
const INLINE_CODE = /`[^`\n]+`/g;
const JSX_TAG = /<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>/g;
const JSX_ATTRIBUTE_VALUE = /="([^"\n]*)"/g;
const ESM_LINE = /^(?:import|export)\b[^\n]*$/gm;
const EXPRESSION = /\{[^{}\n]*\}/g;

/** @typedef {{ nbsp?: boolean }} LintOptions */

function blankKeepingLines(text) {
  return text.replace(/[^\n]/g, ' ');
}

/** Код і вирази замінюються не пробілами, а крапкою: інакше сусідні пробіли зливаються й лінт бачить хибне «зайве» тире. */
function maskKeepingLines(text) {
  return text.replace(/[^\n]/g, '·');
}

/** JSX-тег → пробіли, але рядкові значення атрибутів (title="…") лишаються для перевірки. */
function blankTagKeepingAttributeValues(tag) {
  let result = '';
  let last = 0;
  for (const match of tag.matchAll(JSX_ATTRIBUTE_VALUE)) {
    const valueStart = match.index + 2;
    result += blankKeepingLines(tag.slice(last, valueStart)) + match[1];
    last = valueStart + match[1].length;
  }
  return result + blankKeepingLines(tag.slice(last));
}

/** Порівнює рядок з нормалізованим; повертає знахідку або null. */
function compareLine(line, index, options) {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  const expected = normalizeTypography(line, { nbsp: options.nbsp === true });
  return expected === line ? null : { line: index + 1, actual: trimmed, expected: expected.trim() };
}

/**
 * Прозова частина MDX без frontmatter, коду, ESM-рядків, JSX-тегів і виразів у фігурних дужках.
 * Вирізане замінюється пробілами, щоб номери рядків збігалися з файлом.
 * @param {string} source
 */
export function proseOfMdx(source) {
  return source
    .replace(FRONTMATTER, blankKeepingLines)
    .replace(FENCE, blankKeepingLines)
    .replace(INLINE_CODE, maskKeepingLines)
    .replace(ESM_LINE, blankKeepingLines)
    .replace(JSX_TAG, blankTagKeepingAttributeValues)
    .replace(EXPRESSION, maskKeepingLines);
}

/**
 * @param {string} source
 * @param {LintOptions} [options]
 * @returns {Finding[]}
 */
export function lintMdx(source, options = {}) {
  const bodyFindings = proseOfMdx(source)
    .split('\n')
    .map((line, index) => compareLine(line, index, options))
    .filter((finding) => finding !== null);
  const frontmatter = FRONTMATTER.exec(source);
  const yamlFindings = frontmatter ? lintYaml(frontmatter[1], options).map((f) => ({ ...f, line: f.line + 1 })) : [];
  return [...yamlFindings, ...bodyFindings].sort((a, b) => a.line - b.line);
}

/**
 * Перевіряє лише рядкові значення YAML (ключі та синтаксичні лапки — не типографіка).
 * @param {string} source
 * @param {LintOptions} [options]
 * @returns {Finding[]}
 */
export function lintYaml(source, options = {}) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, keepSourceTokens: true });
  /** @type {Finding[]} */
  const findings = [];
  const check = (node) => {
    if (!isScalar(node) || typeof node.value !== 'string' || !node.range) return;
    const expected = normalizeTypography(node.value, { nbsp: options.nbsp === true });
    if (expected === node.value) return;
    findings.push({ line: lineCounter.linePos(node.range[0]).line, ...firstDiffLine(node.value, expected) });
  };
  visit(doc, {
    Pair: (_key, pair) => check(pair.value),
    Seq: (_key, seq) => seq.items.forEach(check),
  });
  return findings.sort((a, b) => a.line - b.line);
}

/** Для багаторядкових значень показує перший рядок, що відрізняється. */
function firstDiffLine(actual, expected) {
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  const index = actualLines.findIndex((line, i) => line !== expectedLines[i]);
  const at = index === -1 ? 0 : index;
  return { actual: (actualLines[at] ?? '').trim(), expected: (expectedLines[at] ?? '').trim() };
}

/** Показує невидимі відмінності (нерозривний пробіл) явно. */
export function showInvisible(text) {
  return text.replace(/ /g, '⍽');
}

/**
 * @param {string} file
 * @param {Finding[]} findings
 */
export function formatFindings(file, findings) {
  return findings.map(
    (f) => `  ${file}:${f.line}\n    є:     ${showInvisible(f.actual)}\n    треба: ${showInvisible(f.expected)}`,
  );
}
