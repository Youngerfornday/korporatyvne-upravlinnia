/** Витяг посилань на норми з моделі контенту: lawRef-мапи, коди рядків, дати перевірки. */
import { CODE_TOKEN } from './baseline.mjs';
import { normalizeText } from './text.mjs';

const LEGAL_BASELINE_MENTION = /legal-baseline[\s,]+([A-Z]{2,4}(?:-[A-Z]{2})?-\d{2})/g;

/** @typedef {{ line: number, endLine: number, articleLine: number, dateLine: number, act: string, article: string, checkedAt: string|null, url: string|null, codes: string[] }} LawRef */

/** Рядок поля всередині запису: посилатися на `article:` точніше, ніж на початок блоку. */
function fieldLine(file, node, field) {
  for (let line = node.line; line <= Math.min(node.endLine, file.lines.length); line += 1) {
    if (new RegExp(`(^|[\\s{,])${field}:`).test(file.lines[line - 1] ?? '')) return line;
  }
  return node.line;
}

/** Тег <LawNorm …> у тілі лекції — те саме посилання на норму, що й lawRef у frontmatter. Значення атрибутів можуть містити «>». */
const LAW_NORM_TAG = /<LawNorm\b(?:[^>"]|"[^"]*")*>/g;

function attribute(tag, name) {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

function lawNormRefs(file) {
  if (file.kind !== 'mdx') return [];
  return [...file.text.matchAll(LAW_NORM_TAG)].flatMap((match) => {
    const article = attribute(match[0], 'article');
    const checkedAt = attribute(match[0], 'checkedAt');
    if (article === null || checkedAt === null) return [];
    const line = file.text.slice(0, match.index).split('\n').length;
    return [{
      line,
      endLine: line + (match[0].match(/\n/g) ?? []).length,
      articleLine: line,
      dateLine: line,
      act: attribute(match[0], 'act') ?? '',
      article: normalizeText(article),
      checkedAt,
      url: attribute(match[0], 'url'),
      codes: codesIn(article),
    }];
  });
}

/**
 * Посилання на норми: мапи з article і checkedAt (формат docs/research/legal-baseline.md)
 * і теги <LawNorm> з тими самими атрибутами.
 */
export function lawRefsOf(file) {
  const fromMaps = file.maps
    .filter((node) => typeof node.keys.article === 'string' && typeof node.keys.checkedAt === 'string')
    .map((node) => ({
      line: node.line,
      endLine: node.endLine,
      articleLine: fieldLine(file, node, 'article'),
      dateLine: fieldLine(file, node, 'checkedAt'),
      act: String(node.keys.act ?? ''),
      article: normalizeText(String(node.keys.article)),
      checkedAt: String(node.keys.checkedAt),
      url: node.keys.url ? String(node.keys.url) : null,
      codes: codesIn(String(node.keys.article)),
    }));
  return [...fromMaps, ...lawNormRefs(file)];
}

/** Коди в довільному тексті: «ст. 6 ч. 1–4 (AT-01)» → ['AT-01']. */
export function codesIn(text) {
  return [...new Set([...normalizeText(text).matchAll(CODE_TOKEN)].map(([, code]) => code))];
}

/** Згадки «legal-baseline AT-01» у прозі лекцій, приміток і практичних. */
export function baselineMentionsIn(text) {
  return [...normalizeText(text).matchAll(LEGAL_BASELINE_MENTION)].map(([, code]) => code);
}

/** Дати перевірки джерел: sources.yaml і список sources практичної. */
export function sourceCheckedDates(file) {
  return file.maps
    .filter((node) => typeof node.keys.checkedAt === 'string' && typeof node.keys.url === 'string' && typeof node.keys.article !== 'string')
    .map((node) => ({ line: node.line, checkedAt: String(node.keys.checkedAt), id: node.keys.id ? String(node.keys.id) : '', title: String(node.keys.title ?? '') }));
}
