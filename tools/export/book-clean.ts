import { isScheme, schemeToFile, type SchemeFile } from './book-svg.ts';
import {
  attr,
  element,
  escapeAttribute,
  findElements,
  hasAttr,
  hasClass,
  isElement,
  mapElements,
  serializeHtml,
  text,
  textOf,
  type HtmlElement,
  type HtmlNode,
} from './html-tree.ts';

/**
 * Прибирання інтерактиву зі сторінки теми перед розбиттям на глави Книги.
 * Кожне перетворення — окремий прохід по дереву: наступний прохід бачить результат попереднього,
 * тому вкладені випадки (термін усередині розкривного блоку) обробляються без рекурсії вручну.
 */

/** Визначення терміна з поповера сайту: заголовок і HTML означення (без блоку джерела). */
export interface TermDefinition {
  readonly title: string;
  readonly definitionHtml: string;
}

export interface CleanOptions {
  /** Каталог для файлів схем усередині архіву. */
  readonly imageDir: string;
  /** Текст замість інтерактивної самоперевірки. */
  readonly selfCheckNote: string;
}

export interface CleanResult {
  readonly nodes: readonly HtmlNode[];
  readonly terms: ReadonlyMap<string, TermDefinition>;
  readonly schemes: readonly SchemeFile[];
  readonly warnings: readonly string[];
}

export const TERM_MARK_ATTRIBUTE = 'data-ku-term';
const SELF_CHECK_TITLE = 'Самоперевірка';
const DROPPED_TAGS = new Set(['script', 'noscript', 'use']);

function isIconSvg(node: HtmlElement): boolean {
  return node.tag.toLowerCase() === 'svg' && hasClass(node, 'icon');
}

/** Означення термінів з поповерів сторінки: `id` поповера → заголовок і текст. */
export function collectTermDefinitions(nodes: readonly HtmlNode[]): Map<string, TermDefinition> {
  const definitions = new Map<string, TermDefinition>();
  for (const pop of findElements(nodes, (node) => hasAttr(node, 'data-term-pop'))) {
    const id = attr(pop, 'id');
    if (id === null) continue;
    const parts = pop.children.filter((node): node is HtmlElement => isElement(node));
    const title = parts.find((part) => hasClass(part, 'pop-title'));
    const body = parts.filter((part) => part !== title && !hasClass(part, 'pop-src'));
    definitions.set(id, {
      title: title === undefined ? '' : textOf(title.children).trim(),
      definitionHtml: serializeHtml(body.flatMap((part) => part.children)).trim(),
    });
  }
  return definitions;
}

function dropInteractive(nodes: readonly HtmlNode[]): HtmlNode[] {
  return mapElements(nodes, (node) => {
    if (DROPPED_TAGS.has(node.tag.toLowerCase())) return [];
    if (isIconSvg(node)) return [];
    if (hasAttr(node, 'data-term-pop')) return [];
    if (hasAttr(node, 'data-outcomes')) return [];
    if (hasAttr(node, 'data-topic-quiz-cta')) return [];
    return null;
  });
}

function replaceSelfCheck(nodes: readonly HtmlNode[], note: string): { nodes: HtmlNode[]; replaced: number } {
  let replaced = 0;
  const result = mapElements(nodes, (node) => {
    if (!hasAttr(node, 'data-selfcheck')) return null;
    replaced += 1;
    return [
      element('h2', [], [text(SELF_CHECK_TITLE)]),
      element('p', [['class', 'ku-note']], [text(note)]),
    ];
  });
  return { nodes: result, replaced };
}

/** Кнопка терміна → позначка, яку глава перетворить на зноску; інші кнопки — це керування, їх у тексті немає. */
function replaceButtons(nodes: readonly HtmlNode[]): { nodes: HtmlNode[]; dropped: number } {
  let dropped = 0;
  const result = mapElements(nodes, (node) => {
    if (node.tag.toLowerCase() !== 'button') return null;
    const popId = attr(node, 'popovertarget');
    if (hasClass(node, 'term') && popId !== null) {
      return [element('span', [['class', 'ku-term'], [TERM_MARK_ATTRIBUTE, escapeAttribute(popId)]], node.children)];
    }
    dropped += 1;
    return [];
  });
  return { nodes: result, dropped };
}

/**
 * `<details>/<summary>` → звичайні блоки: розкривні елементи не гарантовано переживають
 * очищення HTML у Moodle, а текстовий опис схеми й розбір кейсу мають бути видимі завжди.
 */
function flattenDetails(nodes: readonly HtmlNode[]): HtmlNode[] {
  const withoutDetails = mapElements(nodes, (node) => {
    if (node.tag.toLowerCase() !== 'details') return null;
    const classes = ['ku-details', ...(attr(node, 'class') ?? '').split(/\s+/)].filter((name) => name !== '').join(' ');
    return [element('div', [['class', classes]], node.children)];
  });
  return mapElements(withoutDetails, (node) => {
    if (node.tag.toLowerCase() !== 'summary') return null;
    return [element('p', [['class', 'ku-summary']], [element('strong', [], node.children)])];
  });
}

function replaceSchemes(nodes: readonly HtmlNode[], imageDir: string): {
  nodes: HtmlNode[];
  schemes: SchemeFile[];
  warnings: string[];
} {
  const schemes: SchemeFile[] = [];
  const warnings: string[] = [];
  const result = mapElements(nodes, (node) => {
    if (!isScheme(node)) return null;
    const { file, warnings: found } = schemeToFile(node, `scheme-${schemes.length + 1}`, imageDir);
    schemes.push(file);
    warnings.push(...found);
    const size: Array<readonly [string, string | null]> =
      file.width === null || file.height === null
        ? []
        : [['width', String(file.width)], ['height', String(file.height)]];
    return [
      element('img', [
        ['src', file.path],
        ['alt', escapeAttribute(file.alt)],
        ...size,
        ['style', 'max-width:100%;height:auto'],
      ]),
    ];
  });
  return { nodes: result, schemes, warnings };
}

/** Сторінка теми → вміст, придатний для глави Книги: без скриптів, кнопок і вбудованих схем. */
export function cleanArticle(nodes: readonly HtmlNode[], options: CleanOptions): CleanResult {
  const terms = collectTermDefinitions(nodes);
  const withoutInteractive = dropInteractive(nodes);
  const selfCheck = replaceSelfCheck(withoutInteractive, options.selfCheckNote);
  const buttons = replaceButtons(selfCheck.nodes);
  const flattened = flattenDetails(buttons.nodes);
  const schemes = replaceSchemes(flattened, options.imageDir);
  const warnings = [
    ...schemes.warnings,
    ...(selfCheck.replaced === 0 ? ['на сторінці немає блоку самоперевірки'] : []),
    ...(buttons.dropped > 0 ? [`прибрано кнопок інтерфейсу: ${buttons.dropped}`] : []),
    ...(schemes.schemes.length === 0 ? ['на сторінці немає SVG-схем'] : []),
  ];
  return { nodes: schemes.nodes, terms, schemes: schemes.schemes, warnings };
}
