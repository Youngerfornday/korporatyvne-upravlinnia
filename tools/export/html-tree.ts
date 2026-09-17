/**
 * Мінімальний розбір і серіалізація HTML для експортерів: сторінка теми з `dist/` → глави Книги Moodle.
 * Повноцінний DOM тут не потрібен, зовнішніх залежностей у проєкті немає, а розмітка Astro добре
 * сформована, тож достатньо сканера тегів. Текстові вузли зберігаються як у джерелі (сутності не
 * розкриваються), тому незмінені частини серіалізуються байт у байт.
 */

export interface HtmlElement {
  readonly type: 'element';
  /** Назва тега як у джерелі: SVG чутливий до регістру (`linearGradient`, `clipPath`). */
  readonly tag: string;
  readonly attrs: ReadonlyArray<readonly [string, string | null]>;
  readonly children: readonly HtmlNode[];
  /** `<path />` у SVG: серіалізується без окремого закривального тега. */
  readonly selfClosing: boolean;
}

/** Текст як у джерелі. */
export interface HtmlText {
  readonly type: 'text';
  readonly text: string;
}

/** Коментар, doctype або вміст `<script>`/`<style>`: виводиться без змін. */
export interface HtmlRaw {
  readonly type: 'raw';
  readonly text: string;
}

export type HtmlNode = HtmlElement | HtmlText | HtmlRaw;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const TAG_START = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/y;
const ATTRIBUTE = /\s*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–',
};

interface OpenElement {
  readonly tag: string;
  readonly attrs: Array<readonly [string, string | null]>;
  readonly children: HtmlNode[];
}

/** Розбирає HTML у дерево вузлів. Невідповідний закривальний тег закриває найближчого предка з такою назвою. */
export function parseHtml(source: string): HtmlNode[] {
  const root: OpenElement = { tag: '#root', attrs: [], children: [] };
  const stack: OpenElement[] = [root];
  let index = 0;

  const top = (): OpenElement => stack[stack.length - 1] as OpenElement;
  const pushText = (text: string): void => {
    if (text !== '') top().children.push({ type: 'text', text });
  };

  while (index < source.length) {
    const next = source.indexOf('<', index);
    if (next < 0) {
      pushText(source.slice(index));
      break;
    }
    pushText(source.slice(index, next));

    const special = readSpecial(source, next);
    if (special) {
      top().children.push({ type: 'raw', text: special.text });
      index = special.end;
      continue;
    }

    TAG_START.lastIndex = next;
    const tagMatch = TAG_START.exec(source);
    if (!tagMatch) {
      pushText('<');
      index = next + 1;
      continue;
    }
    const closing = tagMatch[1] === '/';
    const tag = tagMatch[2] as string;
    const lower = tag.toLowerCase();

    if (closing) {
      const end = source.indexOf('>', TAG_START.lastIndex);
      index = end < 0 ? source.length : end + 1;
      closeTag(stack, tag);
      continue;
    }

    const open = readOpenTag(source, TAG_START.lastIndex);
    index = open.end;
    if (VOID_TAGS.has(lower)) {
      top().children.push({ type: 'element', tag, attrs: open.attrs, children: [], selfClosing: false });
      continue;
    }
    if (open.selfClosing) {
      top().children.push({ type: 'element', tag, attrs: open.attrs, children: [], selfClosing: true });
      continue;
    }
    if (RAW_TEXT_TAGS.has(lower)) {
      const closeAt = findRawTextEnd(source, index, lower);
      const children: HtmlNode[] = closeAt.text === '' ? [] : [{ type: 'raw', text: closeAt.text }];
      top().children.push({ type: 'element', tag, attrs: open.attrs, children, selfClosing: false });
      index = closeAt.end;
      continue;
    }
    stack.push({ tag, attrs: open.attrs, children: [] });
  }

  while (stack.length > 1) closeTag(stack, (top()).tag);
  return root.children;
}

function closeTag(stack: OpenElement[], tag: string): void {
  const wanted = tag.toLowerCase();
  const depth = stack.findLastIndex((open) => open.tag.toLowerCase() === wanted);
  if (depth < 1) return;
  while (stack.length > depth) {
    const open = stack.pop() as OpenElement;
    const parent = stack[stack.length - 1] as OpenElement;
    parent.children.push({ type: 'element', tag: open.tag, attrs: open.attrs, children: open.children, selfClosing: false });
  }
}

/** Коментар, doctype або оголошення XML: беремо як є. */
function readSpecial(source: string, at: number): { text: string; end: number } | null {
  if (source.startsWith('<!--', at)) {
    const end = source.indexOf('-->', at + 4);
    const stop = end < 0 ? source.length : end + 3;
    return { text: source.slice(at, stop), end: stop };
  }
  if (source.startsWith('<![CDATA[', at)) {
    const end = source.indexOf(']]>', at + 9);
    const stop = end < 0 ? source.length : end + 3;
    return { text: source.slice(at, stop), end: stop };
  }
  if (source.startsWith('<!', at) || source.startsWith('<?', at)) {
    const end = source.indexOf('>', at);
    const stop = end < 0 ? source.length : end + 1;
    return { text: source.slice(at, stop), end: stop };
  }
  return null;
}

function readOpenTag(source: string, from: number): { attrs: Array<readonly [string, string | null]>; selfClosing: boolean; end: number } {
  const attrs: Array<readonly [string, string | null]> = [];
  let index = from;
  for (;;) {
    while (index < source.length && /\s/.test(source[index] as string)) index += 1;
    if (index >= source.length) return { attrs, selfClosing: false, end: source.length };
    if (source[index] === '>') return { attrs, selfClosing: false, end: index + 1 };
    if (source.startsWith('/>', index)) return { attrs, selfClosing: true, end: index + 2 };
    ATTRIBUTE.lastIndex = index;
    const match = ATTRIBUTE.exec(source);
    if (!match) {
      index += 1;
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4];
    attrs.push([match[1] as string, value === undefined ? null : value]);
    index = ATTRIBUTE.lastIndex;
  }
}

function findRawTextEnd(source: string, from: number, tag: string): { text: string; end: number } {
  const close = new RegExp(`</${tag}\\s*>`, 'i');
  const rest = source.slice(from);
  const match = close.exec(rest);
  if (!match) return { text: rest, end: source.length };
  return { text: rest.slice(0, match.index), end: from + match.index + match[0].length };
}

export function serializeHtml(nodes: readonly HtmlNode[]): string {
  return nodes.map(serializeNode).join('');
}

function serializeNode(node: HtmlNode): string {
  if (node.type === 'text' || node.type === 'raw') return node.text;
  const attrs = node.attrs.map(([name, value]) => (value === null ? ` ${name}` : ` ${name}="${value}"`)).join('');
  if (node.selfClosing) return `<${node.tag}${attrs} />`;
  const open = `<${node.tag}${attrs}>`;
  if (VOID_TAGS.has(node.tag.toLowerCase())) return open;
  return `${open}${serializeHtml(node.children)}</${node.tag}>`;
}

export function isElement(node: HtmlNode, tag?: string): node is HtmlElement {
  return node.type === 'element' && (tag === undefined || node.tag.toLowerCase() === tag);
}

/** Назви атрибутів HTML нечутливі до регістру, тому порівнюємо в нижньому. */
export function attr(element: HtmlElement, name: string): string | null {
  const found = element.attrs.find(([key]) => key.toLowerCase() === name);
  return found === undefined ? null : found[1];
}

export function hasAttr(element: HtmlElement, name: string): boolean {
  return element.attrs.some(([key]) => key.toLowerCase() === name);
}

export function classList(element: HtmlElement): string[] {
  return (attr(element, 'class') ?? '').split(/\s+/).filter((name) => name !== '');
}

export function hasClass(element: HtmlElement, name: string): boolean {
  return classList(element).includes(name);
}

export function element(tag: string, attrs: ReadonlyArray<readonly [string, string | null]>, children: readonly HtmlNode[] = []): HtmlElement {
  return { type: 'element', tag, attrs, children, selfClosing: false };
}

export function text(value: string): HtmlText {
  return { type: 'text', text: value };
}

export function raw(value: string): HtmlRaw {
  return { type: 'raw', text: value };
}

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}

/** Текст піддерева з розкритими базовими сутностями: назви глав, alt схем, підписи. */
export function textOf(nodes: readonly HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return decodeEntities(node.text);
      if (node.type === 'raw') return '';
      return textOf(node.children);
    })
    .join('');
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Обхід дерева з заміною елементів. `visit` повертає:
 *   `null` — лишити елемент і зайти в дітей;
 *   масив вузлів — замінити елемент на них (у них уже не заходимо).
 */
export function mapElements(nodes: readonly HtmlNode[], visit: (element: HtmlElement) => HtmlNode[] | null): HtmlNode[] {
  return nodes.flatMap((node) => {
    if (!isElement(node)) return [node];
    const replacement = visit(node);
    if (replacement !== null) return replacement;
    return [{ ...node, children: mapElements(node.children, visit) }];
  });
}

/** Усі елементи піддерева за предикатом, у порядку документа. */
export function findElements(nodes: readonly HtmlNode[], match: (element: HtmlElement) => boolean): HtmlElement[] {
  return nodes.flatMap((node) => {
    if (!isElement(node)) return [];
    return [...(match(node) ? [node] : []), ...findElements(node.children, match)];
  });
}

export function findElement(nodes: readonly HtmlNode[], match: (element: HtmlElement) => boolean): HtmlElement | null {
  return findElements(nodes, match)[0] ?? null;
}

/** Порожній текстовий вузол (лише пробіли) — для перевірок «глава складається тільки з…». */
export function isBlank(node: HtmlNode): boolean {
  return node.type !== 'element' && node.text.trim() === '';
}
