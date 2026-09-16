/**
 * Строгий мінімальний парсер XML для тестів експортерів (без залежностей): перевіряє well-formedness
 * (одна корінна вершина, парні теги, лапки атрибутів, коректні сутності, заборонені символи, `]]>` поза CDATA)
 * і повертає дерево для перевірок вмісту. DTD і простори імен не підтримуються — експортери їх не виводять.
 */

export interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
  /** Увесь текст вершини без дочірніх елементів (сутності розкрито, CDATA — буквально). */
  readonly text: string;
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const FORBIDDEN_CHARACTER = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export class XmlSyntaxError extends Error {}

class Cursor {
  position = 0;
  readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  fail(message: string): never {
    throw new XmlSyntaxError(`${message} (позиція ${this.position})`);
  }

  startsWith(token: string): boolean {
    return this.source.startsWith(token, this.position);
  }

  expect(token: string): void {
    if (!this.startsWith(token)) this.fail(`очікувалося «${token}»`);
    this.position += token.length;
  }

  skipWhitespace(): void {
    while (/\s/.test(this.source[this.position] ?? '')) this.position += 1;
  }

  readName(): string {
    NAME.lastIndex = this.position;
    const match = NAME.exec(this.source);
    if (!match) this.fail('очікувалося ім’я');
    this.position += match[0].length;
    return match[0];
  }

  readUntil(token: string): string {
    const end = this.source.indexOf(token, this.position);
    if (end < 0) this.fail(`не знайдено «${token}»`);
    const value = this.source.slice(this.position, end);
    this.position = end + token.length;
    return value;
  }
}

function decodeEntities(raw: string, cursor: Cursor): string {
  return raw.replace(/&([^;]*);|&/g, (whole, body: string | undefined) => {
    if (body === undefined) cursor.fail('символ & без сутності');
    const named = NAMED_ENTITIES[body];
    if (named !== undefined) return named;
    const numeric = /^#(\d+)$/.exec(body) ?? /^#x([0-9a-fA-F]+)$/.exec(body);
    if (!numeric) cursor.fail(`невідома сутність «${whole}»`);
    const code = Number.parseInt(numeric[1] as string, body.startsWith('#x') ? 16 : 10);
    const char = String.fromCodePoint(code);
    if (FORBIDDEN_CHARACTER.test(char)) cursor.fail(`сутність «${whole}» задає заборонений символ`);
    return char;
  });
}

function skipMisc(cursor: Cursor): void {
  for (;;) {
    cursor.skipWhitespace();
    if (cursor.startsWith('<!--')) {
      cursor.position += 4;
      if (cursor.readUntil('-->').includes('--')) cursor.fail('«--» усередині коментаря');
    } else if (cursor.startsWith('<?')) {
      cursor.readUntil('?>');
    } else {
      return;
    }
  }
}

function parseAttributes(cursor: Cursor): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (;;) {
    const before = cursor.position;
    cursor.skipWhitespace();
    if (cursor.startsWith('>') || cursor.startsWith('/>')) return attributes;
    if (cursor.position === before) cursor.fail('між атрибутами потрібен пробіл');
    const name = cursor.readName();
    cursor.skipWhitespace();
    cursor.expect('=');
    cursor.skipWhitespace();
    const quote = cursor.source[cursor.position];
    if (quote !== '"' && quote !== "'") cursor.fail('значення атрибута має бути в лапках');
    cursor.position += 1;
    const raw = cursor.readUntil(quote);
    if (raw.includes('<')) cursor.fail('символ < у значенні атрибута');
    if (name in attributes) cursor.fail(`атрибут «${name}» повторюється`);
    attributes[name] = decodeEntities(raw, cursor);
  }
}

function parseElement(cursor: Cursor): XmlNode {
  cursor.expect('<');
  const name = cursor.readName();
  const attributes = parseAttributes(cursor);
  if (cursor.startsWith('/>')) {
    cursor.position += 2;
    return { name, attributes, children: [], text: '' };
  }
  cursor.expect('>');
  const children: XmlNode[] = [];
  let text = '';
  for (;;) {
    if (cursor.position >= cursor.source.length) cursor.fail(`тег «${name}» не закрито`);
    if (cursor.startsWith('</')) {
      cursor.position += 2;
      if (cursor.readName() !== name) cursor.fail(`закривальний тег не відповідає «${name}»`);
      cursor.skipWhitespace();
      cursor.expect('>');
      return { name, attributes, children, text };
    }
    if (cursor.startsWith('<![CDATA[')) {
      cursor.position += 9;
      text += cursor.readUntil(']]>');
    } else if (cursor.startsWith('<!--') || cursor.startsWith('<?')) {
      skipMisc(cursor);
    } else if (cursor.startsWith('<')) {
      children.push(parseElement(cursor));
    } else {
      const next = cursor.source.indexOf('<', cursor.position);
      const raw = cursor.source.slice(cursor.position, next < 0 ? cursor.source.length : next);
      if (raw.includes(']]>')) cursor.fail('«]]>» поза CDATA');
      text += decodeEntities(raw, cursor);
      cursor.position += raw.length;
    }
  }
}

export function parseXml(source: string): XmlNode {
  const forbidden = FORBIDDEN_CHARACTER.exec(source);
  if (forbidden) throw new XmlSyntaxError(`заборонений символ U+${forbidden[0].codePointAt(0)?.toString(16)}`);
  const cursor = new Cursor(source);
  if (cursor.startsWith('<?xml')) cursor.readUntil('?>');
  skipMisc(cursor);
  if (!cursor.startsWith('<')) cursor.fail('немає кореневого елемента');
  const root = parseElement(cursor);
  skipMisc(cursor);
  if (cursor.position !== source.length) cursor.fail('вміст після кореневого елемента');
  return root;
}

export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => child.name === name);
}

/** Єдина дочірня вершина з іменем; інакше помилка (щоб тест не пройшов мовчки). */
export function child(node: XmlNode, name: string): XmlNode {
  const found = childrenNamed(node, name);
  if (found.length !== 1) throw new Error(`Очікувався рівно один <${name}> у <${node.name}>, знайдено ${found.length}`);
  return found[0] as XmlNode;
}

/** Текст за шляхом дочірніх вершин: textAt(question, 'name', 'text'). */
export function textAt(node: XmlNode, ...path: string[]): string {
  return path.reduce((current, name) => child(current, name), node).text;
}
