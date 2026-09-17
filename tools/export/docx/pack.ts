import { Packer, type Document } from 'docx';
import { readZip } from '../unzip.ts';
import { createZip, type ZipEntry } from '../zip.ts';

/**
 * Відтворюваний DOCX. Бібліотека `docx` ставить у docProps/core.xml поточний час, JSZip — поточний час файлів,
 * а зовнішнім посиланням дає випадкові ID зв'язків (nanoid). Тут архів перепаковується нашим `zip.ts`
 * з фіксованим часом, дати замінюються на дату збірки, а ID посилань — на послідовні `rIdLink1…`.
 */

const CORE_PROPERTIES = 'docProps/core.xml';
const DOCUMENT_XML = 'word/document.xml';
const DOCUMENT_RELS = 'word/_rels/document.xml.rels';
/** `rId` + nanoid у нижньому регістрі (21 символ) — так `docx` називає зв'язки зовнішніх посилань. */
const RANDOM_RELATIONSHIP = /rId[a-z0-9_-]{21}(?![a-z0-9_-])/g;

function w3cDate(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function withFixedDates(xml: string, date: Date): string {
  return xml.replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g, `$1${w3cDate(date)}$2`);
}

/** Однакові випадкові ID у document.xml і document.xml.rels отримують однакові послідовні імена. */
export function stableRelationshipIds(entries: readonly ZipEntry[]): ZipEntry[] {
  const rels = entries.find((entry) => entry.path === DOCUMENT_RELS);
  if (!rels) return [...entries];
  const ids = [...new Set(Buffer.from(rels.data).toString('utf8').match(RANDOM_RELATIONSHIP) ?? [])];
  const renamed = new Map(ids.map((id, index) => [id, `rIdLink${index + 1}`]));
  return entries.map((entry) => {
    if (entry.path !== DOCUMENT_RELS && entry.path !== DOCUMENT_XML) return entry;
    const text = Buffer.from(entry.data).toString('utf8').replace(RANDOM_RELATIONSHIP, (id) => renamed.get(id) ?? id);
    return { path: entry.path, data: Buffer.from(text, 'utf8') };
  });
}

export async function packDocx(document: Document, date: Date): Promise<Buffer> {
  const packed = await Packer.toBuffer(document);
  const entries = stableRelationshipIds(readZip(packed)).map((entry) =>
    entry.path === CORE_PROPERTIES ? { path: entry.path, data: Buffer.from(withFixedDates(Buffer.from(entry.data).toString('utf8'), date), 'utf8') } : entry,
  );
  return createZip(entries);
}
