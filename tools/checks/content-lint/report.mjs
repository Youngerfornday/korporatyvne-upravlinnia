/** Звіт лінту контенту: групування за файлами, рівні, підказки, підсумок за правилами. */
import { ERROR } from './finding.mjs';

export const RULE_TITLES = {
  'law-number': 'Номери законів — лише ті, що є в legal-baseline.md',
  'law-code': 'Коди норм і статті — як записано в legal-baseline.md',
  'unconfirmed-zone': 'Заборонена зона: розділ «Не підтверджено»',
  'checked-date': 'Дати перевірки норм і джерел',
  'case-caveat': 'Застереження кейсів (caveat у course.yaml)',
  'source-unused': 'Джерела, на які ніхто не посилається',
  'source-missing': 'Висячі посилання на джерела',
  term: 'Терміни, введені через <Term>',
  'number-without-source': 'Числа без джерела поруч',
};

const LEVEL_LABEL = { error: 'ПОМИЛКА', warning: 'УВАГА  ' };

function compareFindings(a, b) {
  return a.file.localeCompare(b.file, 'uk') || a.line - b.line || a.rule.localeCompare(b.rule);
}

function pluralUk(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * @param {import('./finding.mjs').Finding[]} findings
 * @param {{ fileCount: number, fixHints?: boolean, strict?: boolean }} options
 * @returns {string[]}
 */
export function formatReport(findings, { fileCount, fixHints = false, strict = false }) {
  const errors = findings.filter((finding) => finding.level === ERROR);
  const warnings = findings.filter((finding) => finding.level !== ERROR);
  const lines = [];
  const grouped = new Map();
  for (const finding of [...findings].sort(compareFindings)) {
    grouped.set(finding.file, [...(grouped.get(finding.file) ?? []), finding]);
  }

  for (const [file, items] of grouped) {
    lines.push('', `${file} — ${items.length} ${pluralUk(items.length, 'знахідка', 'знахідки', 'знахідок')}`);
    for (const finding of items) {
      const level = strict ? LEVEL_LABEL.error : LEVEL_LABEL[finding.level];
      lines.push(`  ряд. ${String(finding.line).padStart(4)}  ${level}  [${finding.rule}] ${finding.message}`);
      if (finding.quote) lines.push(`                       цитата: «${finding.quote}»`);
      if (fixHints) lines.push(`                       як виправити: ${finding.hint}`);
    }
  }

  const byRule = new Map();
  for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
  if (byRule.size > 0) {
    lines.push('', 'Підсумок за правилами:');
    for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${rule.padEnd(22)} ${String(count).padStart(3)} — ${RULE_TITLES[rule] ?? rule}`);
    }
  }

  const head = findings.length === 0
    ? `lint:content: гаразд — перевірено файлів: ${fileCount}, порушень немає.`
    : `lint:content: перевірено файлів: ${fileCount}; помилок — ${errors.length}, попереджень — ${warnings.length}.`;
  return [head, ...lines, ...(findings.length > 0 && !fixHints ? ['', 'Підказки, як виправити кожну знахідку: запустіть з прапорцем --fix-hints.'] : [])];
}

/** 1 — якщо є помилки (у --strict помилками стають і попередження). */
export function exitCode(findings, { strict = false, warnOnly = false } = {}) {
  if (warnOnly) return 0;
  const blocking = findings.filter((finding) => strict || finding.level === ERROR);
  return blocking.length > 0 ? 1 : 0;
}
