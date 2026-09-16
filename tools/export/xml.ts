/**
 * Мінімальний серіалізатор XML для експортерів у Moodle: стабільний порядок полів, відступ у два пробіли,
 * екранування в одному місці. Порожні рядки й коментарі між полями не додаються — вивід придатний для снапшотів.
 */

type XmlBody =
  | { readonly kind: 'empty' }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'cdata'; readonly value: string }
  | { readonly kind: 'children'; readonly children: readonly XmlElement[] };

export interface XmlElement {
  readonly tag: string;
  readonly attributes: ReadonlyArray<readonly [string, string]>;
  readonly body: XmlBody;
}

export type XmlAttributes = Readonly<Record<string, string>>;

const INDENT = '  ';
/** Символи, недопустимі в XML 1.0 (керівні, крім табуляції й переносів, і сурогати без пари). */
const INVALID_XML_CHARACTER = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

function assertXmlCharacters(value: string): string {
  const match = INVALID_XML_CHARACTER.exec(value);
  if (match) {
    const code = match[0].codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0');
    throw new Error(`Недопустимий у XML символ U+${code} у тексті «${value.slice(0, 60)}»`);
  }
  return value;
}

export function escapeXmlText(value: string): string {
  return assertXmlCharacters(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;');
}

/** CDATA не може містити `]]>`: розриваємо секцію, як радить специфікація XML. */
export function cdata(value: string): string {
  return `<![CDATA[${assertXmlCharacters(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toAttributes(attributes: XmlAttributes): ReadonlyArray<readonly [string, string]> {
  return Object.entries(attributes);
}

export function element(tag: string, children: readonly XmlElement[], attributes: XmlAttributes = {}): XmlElement {
  return { tag, attributes: toAttributes(attributes), body: { kind: 'children', children } };
}

export function textElement(tag: string, value: string, attributes: XmlAttributes = {}): XmlElement {
  return { tag, attributes: toAttributes(attributes), body: { kind: 'text', value } };
}

export function cdataElement(tag: string, value: string, attributes: XmlAttributes = {}): XmlElement {
  return { tag, attributes: toAttributes(attributes), body: { kind: 'cdata', value } };
}

export function emptyElement(tag: string, attributes: XmlAttributes = {}): XmlElement {
  return { tag, attributes: toAttributes(attributes), body: { kind: 'empty' } };
}

function openTag(node: XmlElement): string {
  const attributes = node.attributes.map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`).join('');
  return `<${node.tag}${attributes}`;
}

/** Елемент без вкладених елементів — текст, CDATA або порожній тег — завжди в один рядок. */
function renderLeaf(node: XmlElement): string | null {
  switch (node.body.kind) {
    case 'empty':
      return `${openTag(node)}/>`;
    case 'text':
      return `${openTag(node)}>${escapeXmlText(node.body.value)}</${node.tag}>`;
    case 'cdata':
      return `${openTag(node)}>${cdata(node.body.value)}</${node.tag}>`;
    case 'children':
      return node.body.children.length === 0 ? `${openTag(node)}></${node.tag}>` : null;
  }
}

function renderLines(node: XmlElement, depth: number): string[] {
  const pad = INDENT.repeat(depth);
  const leaf = renderLeaf(node);
  if (leaf !== null) return [`${pad}${leaf}`];
  const { children } = node.body as { readonly children: readonly XmlElement[] };
  // Обгортка з одним простим полем (`<name><text>…</text></name>`) — теж в один рядок, як у фікстурах спайку.
  const onlyChild = children.length === 1 ? children[0] : undefined;
  const inline = onlyChild ? renderLeaf(onlyChild) : null;
  if (inline !== null) return [`${pad}${openTag(node)}>${inline}</${node.tag}>`];
  return [`${pad}${openTag(node)}>`, ...children.flatMap((child) => renderLines(child, depth + 1)), `${pad}</${node.tag}>`];
}

export interface SerializeOptions {
  /** Коментар після декларації XML (без `--`). */
  readonly comment?: string;
}

export function serializeXml(root: XmlElement, options: SerializeOptions = {}): string {
  const comment = options.comment;
  if (comment !== undefined && comment.includes('--')) throw new Error('Коментар XML не може містити «--»');
  const header = ['<?xml version="1.0" encoding="UTF-8"?>', ...(comment ? [`<!-- ${assertXmlCharacters(comment)} -->`] : [])];
  return `${[...header, ...renderLines(root, 0)].join('\n')}\n`;
}
