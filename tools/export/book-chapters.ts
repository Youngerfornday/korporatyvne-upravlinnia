import { TERM_MARK_ATTRIBUTE, type TermDefinition } from './book-clean.ts';
import { CLASS_STYLES, TAG_STYLES } from './book-style.ts';
import {
  attr,
  classList,
  element,
  escapeAttribute,
  escapeHtmlText,
  findElements,
  hasAttr,
  isBlank,
  isElement,
  mapElements,
  raw,
  serializeHtml,
  text,
  textOf,
  type HtmlElement,
  type HtmlNode,
} from './html-tree.ts';

/**
 * Розбиття вмісту теми на глави Книги і складання HTML-файлу глави.
 *
 * Книга Moodle нумерує глави сама і виводить назву над текстом, тому назва береться з `<title>`
 * без номера, а в тілі глави заголовка з тією ж назвою немає (див. tools/moodle/README.md, п. 10).
 */

export interface Chapter {
  readonly title: string;
  readonly nodes: readonly HtmlNode[];
}

export interface ChapterFile {
  readonly file: string;
  readonly title: string;
  readonly html: string;
  /** Скільки термінів глосарію перетворено на зноски. */
  readonly terms: number;
}

export interface SplitOptions {
  /** Назва глави для тексту до першого `h2`. */
  readonly preambleTitle: string;
}

export interface RenderOptions {
  /** Корінь сайту разом із base: за ним абсолютизуються внутрішні посилання. */
  readonly siteUrl: string;
  readonly terms: ReadonlyMap<string, TermDefinition>;
  readonly termsHeading: string;
}

const LEADING_NUMBER = /^\d+(?:\.\d+)*[.)]?\s+/;
const DROPPED_ATTRIBUTES = new Set(['popover', 'popovertarget', 'aria-controls', 'aria-expanded', 'tabindex']);
const SELF_STUDY_ATTRIBUTE = 'data-srs-task';

export function chapterFileName(index: number): string {
  return `chapter-${String(index + 1).padStart(2, '0')}.html`;
}

/** Текст `h2` без власного номера: нумерацію додає сама Книга. */
export function chapterTitle(heading: HtmlElement): string {
  return textOf(heading.children).replace(/\s+/g, ' ').trim().replace(LEADING_NUMBER, '');
}

/** Секції верхнього рівня — семантичні обгортки сторінки; їхні `h2` теж мають ділити главу. */
function unwrapSections(nodes: readonly HtmlNode[]): HtmlNode[] {
  return nodes.flatMap((node) => (isElement(node, 'section') ? node.children : [node]));
}

/**
 * Глава «Самостійна робота» дублювала б Сторінку теми з тими самими завданнями,
 * тому глава, у якій немає нічого, крім блоків СРС, у Книгу не потрапляє.
 */
function isSelfStudyChapter(chapter: Chapter): boolean {
  const blocks = chapter.nodes.filter((node) => !isBlank(node));
  return blocks.length > 0 && blocks.every((node) => isElement(node) && hasAttr(node, SELF_STUDY_ATTRIBUTE));
}

export function splitChapters(nodes: readonly HtmlNode[], options: SplitOptions): Chapter[] {
  const chapters: Chapter[] = [];
  let title = options.preambleTitle;
  let current: HtmlNode[] = [];

  const flush = (): void => {
    if (current.some((node) => !isBlank(node))) chapters.push({ title, nodes: current });
    current = [];
  };

  for (const node of unwrapSections(nodes)) {
    if (isElement(node, 'h2')) {
      flush();
      title = chapterTitle(node);
      continue;
    }
    current.push(node);
  }
  flush();
  return chapters.filter((chapter) => !isSelfStudyChapter(chapter));
}

/** Кожен `id` глави → файл, у якому він опинився: за цим переписуються посилання на якорі. */
function indexAnchors(chapters: readonly Chapter[]): Map<string, string> {
  const index = new Map<string, string>();
  chapters.forEach((chapter, position) => {
    for (const node of findElements(chapter.nodes, (candidate) => attr(candidate, 'id') !== null)) {
      const id = attr(node, 'id') as string;
      if (!index.has(id)) index.set(id, chapterFileName(position));
    }
  });
  return index;
}

function rewriteLinks(
  nodes: readonly HtmlNode[],
  context: { readonly file: string; readonly anchors: ReadonlyMap<string, string>; readonly siteUrl: string },
): { nodes: HtmlNode[]; warnings: string[] } {
  const warnings: string[] = [];
  const result = mapElements(nodes, (node) => {
    if (node.tag.toLowerCase() !== 'a') return null;
    const href = attr(node, 'href');
    if (href === null || href === '') return null;
    if (/^(?:https?:|mailto:|tel:)/i.test(href)) return null;

    if (href.startsWith('#')) {
      const target = context.anchors.get(href.slice(1));
      if (target === undefined) {
        warnings.push(`посилання на якір ${href} веде за межі Книги — залишено лише текст`);
        return node.children as HtmlNode[];
      }
      const rewritten = target === context.file ? href : `${target}${href}`;
      return [{ ...node, attrs: replaceAttr(node.attrs, 'href', rewritten) }];
    }
    // Внутрішнє посилання сайту: у Moodle воно має вести на живий сайт курсу.
    const absolute = new URL(href, context.siteUrl).toString();
    return [{ ...node, attrs: replaceAttr(node.attrs, 'href', absolute) }];
  });
  return { nodes: result, warnings };
}

function replaceAttr(
  attrs: ReadonlyArray<readonly [string, string | null]>,
  name: string,
  value: string,
): Array<readonly [string, string | null]> {
  return attrs.map((pair) => (pair[0].toLowerCase() === name ? ([name, escapeAttribute(value)] as const) : pair));
}

/** Терміни глосарію: у тексті лишається слово зі зноскою, означення — списком у кінці глави. */
function applyTerms(nodes: readonly HtmlNode[], terms: ReadonlyMap<string, TermDefinition>): {
  nodes: HtmlNode[];
  used: Array<{ readonly number: number; readonly definition: TermDefinition }>;
  warnings: string[];
} {
  const numbers = new Map<string, number>();
  const used: Array<{ number: number; definition: TermDefinition }> = [];
  const warnings: string[] = [];

  const result = mapElements(nodes, (node) => {
    const popId = attr(node, TERM_MARK_ATTRIBUTE);
    if (popId === null) return null;
    const definition = terms.get(popId);
    if (definition === undefined) {
      warnings.push(`означення терміна ${popId} не знайдено — лишено лише текст`);
      return node.children as HtmlNode[];
    }
    let number = numbers.get(popId);
    if (number === undefined) {
      number = numbers.size + 1;
      numbers.set(popId, number);
      used.push({ number, definition });
    }
    const reference = element(
      'sup',
      [['class', 'ku-term-ref']],
      [element('a', [['href', `#ku-term-${number}`]], [text(String(number))])],
    );
    return [element('span', [['class', 'ku-term']], [...node.children, reference])];
  });
  return { nodes: result, used, warnings };
}

function termsBlock(
  used: ReadonlyArray<{ readonly number: number; readonly definition: TermDefinition }>,
  heading: string,
): HtmlNode[] {
  if (used.length === 0) return [];
  const items = used.map(({ number, definition }) =>
    element(
      'li',
      [['id', `ku-term-${number}`]],
      [element('strong', [], [text(escapeHtmlText(definition.title))]), text(' — '), raw(definition.definitionHtml)],
    ),
  );
  return [
    element('div', [['class', 'ku-terms']], [
      element('p', [['class', 'ku-summary']], [element('strong', [], [text(heading)])]),
      element('ol', [], items),
    ]),
  ];
}

/**
 * Дописує елементам оформлення атрибутом `style`: у Moodle 5.2.2 блок `<style>` з `<head>` у главу
 * не потрапляє, а атрибут `style` переживає і імпорт, і очищення HTML.
 */
function applyInlineStyles(nodes: readonly HtmlNode[]): HtmlNode[] {
  return mapElements(nodes, (node) => {
    const fromClasses = classList(node)
      .map((name) => CLASS_STYLES[name])
      .filter((style): style is string => style !== undefined);
    const fromTag = TAG_STYLES[node.tag.toLowerCase()];
    const added = [...(fromTag === undefined ? [] : [fromTag]), ...fromClasses];
    if (added.length === 0) return null;
    const existing = attr(node, 'style');
    const style = [...added, ...(existing === null || existing === '' ? [] : [existing])].join(' ');
    const attrs: Array<readonly [string, string | null]> = [
      ...node.attrs.filter(([name]) => name.toLowerCase() !== 'style'),
      ['style', escapeAttribute(style)],
    ];
    return [{ ...node, attrs, children: applyInlineStyles(node.children) }];
  });
}

/** Прибирає технічні атрибути сайту: усі `data-*` і атрибути поповерів. */
function stripAttributes(nodes: readonly HtmlNode[]): HtmlNode[] {
  return mapElements(nodes, (node) => {
    const kept = node.attrs.filter(([name]) => {
      const lower = name.toLowerCase();
      return !lower.startsWith('data-') && !DROPPED_ATTRIBUTES.has(lower);
    });
    if (kept.length === node.attrs.length) return null;
    return [{ ...node, attrs: kept, children: stripAttributes(node.children) }];
  });
}

export function renderChapterDocument(title: string, body: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="uk">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtmlText(title)}</title>`,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export function renderChapters(chapters: readonly Chapter[], options: RenderOptions): {
  files: ChapterFile[];
  warnings: string[];
} {
  const anchors = indexAnchors(chapters);
  const warnings: string[] = [];
  const files = chapters.map((chapter, position) => {
    const file = chapterFileName(position);
    const links = rewriteLinks(chapter.nodes, { file, anchors, siteUrl: options.siteUrl });
    const terms = applyTerms(links.nodes, options.terms);
    const styled = applyInlineStyles([...terms.nodes, ...termsBlock(terms.used, options.termsHeading)]);
    const body = stripAttributes(styled);
    warnings.push(...links.warnings.map((warning) => `${file}: ${warning}`));
    warnings.push(...terms.warnings.map((warning) => `${file}: ${warning}`));
    return {
      file,
      title: chapter.title,
      html: renderChapterDocument(chapter.title, serializeHtml(body).trim()),
      terms: terms.used.length,
    };
  });
  return { files, warnings };
}
