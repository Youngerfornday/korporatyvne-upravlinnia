import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { CourseSchema, type Course } from '../../../src/content/schemas/course.ts';
import { readZipText } from '../unzip.ts';
import { parseXml, type XmlNode } from './xml-tree.ts';

/** Розбір DOCX для тестів: абзаци, заголовки й таблиці з `word/document.xml` через строгий парсер XML. */

export async function loadCourse(): Promise<Course> {
  return CourseSchema.parse(parse(await readFile(new URL('../../../content/course.yaml', import.meta.url), 'utf8')));
}

/** Текст вершини: усі w:t нащадки в порядку документа; нерозривні пробіли — звичайними. */
export function textOf(node: XmlNode): string {
  const own = node.name === 'w:t' ? node.text : '';
  return (own + node.children.map(textOf).join('')).replace(/ /g, ' ');
}

function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((child) => (child.name === name ? [child] : descendants(child, name)));
}

export interface DocxView {
  readonly document: XmlNode;
  /** Абзаци тіла документа поза таблицями. */
  readonly paragraphs: readonly { readonly style: string | undefined; readonly text: string }[];
  /** Таблиці: рядки → тексти клітинок. */
  readonly tables: readonly (readonly (readonly string[])[])[];
  readonly xml: Readonly<Record<'document' | 'styles' | 'comments' | 'numbering' | 'core' | 'rels', string>>;
}

export function viewDocx(docx: Buffer): DocxView {
  const xml = {
    document: readZipText(docx, 'word/document.xml'),
    styles: readZipText(docx, 'word/styles.xml'),
    comments: readZipText(docx, 'word/comments.xml'),
    numbering: readZipText(docx, 'word/numbering.xml'),
    core: readZipText(docx, 'docProps/core.xml'),
    rels: readZipText(docx, 'word/_rels/document.xml.rels'),
  };
  const document = parseXml(xml.document);
  const body = descendants(document, 'w:body')[0] as XmlNode;
  const paragraphs = body.children
    .filter((node) => node.name === 'w:p')
    .map((node) => ({ style: descendants(node, 'w:pStyle')[0]?.attributes['w:val'], text: textOf(node) }));
  const tables = descendants(body, 'w:tbl').map((table) =>
    table.children.filter((row) => row.name === 'w:tr').map((row) => row.children.filter((cell) => cell.name === 'w:tc').map(textOf)),
  );
  return { document, paragraphs, tables, xml };
}

/** Таблиця, у рядку заголовків якої є всі наведені назви стовпців. */
export function tableWithHeaders(view: DocxView, headers: readonly string[]): readonly (readonly string[])[] {
  const found = view.tables.find((table) => headers.every((header) => table[0]?.includes(header)));
  if (!found) throw new Error(`Немає таблиці зі стовпцями ${headers.join(', ')}`);
  return found;
}

export function numberUk(text: string): number {
  return Number(text.replace(/\s/g, '').replace(',', '.'));
}
