import { inflateRawSync } from 'node:zlib';
import type { ZipEntry } from './zip.ts';

/**
 * Читання ZIP за центральним каталогом (stdlib `zlib`): потрібне, щоб перепакувати DOCX з фіксованим часом
 * файлів і щоб тести могли розібрати `word/document.xml`. Підтримуються записи store і deflate без ZIP64 —
 * саме такі створюють `docx` (JSZip) і наш `zip.ts`.
 */

const SIGNATURE = { local: 0x04034b50, central: 0x02014b50, end: 0x06054b50 } as const;
const END_RECORD_SIZE = 22;
const MAX_COMMENT = 0xffff;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

function findEndRecord(zip: Buffer): number {
  const stop = Math.max(0, zip.length - END_RECORD_SIZE - MAX_COMMENT);
  for (let offset = zip.length - END_RECORD_SIZE; offset >= stop; offset -= 1) {
    if (zip.readUInt32LE(offset) === SIGNATURE.end) return offset;
  }
  throw new Error('Це не ZIP-архів: не знайдено запис кінця центрального каталогу');
}

function readEntry(zip: Buffer, central: number): { entry: ZipEntry; next: number } {
  if (zip.readUInt32LE(central) !== SIGNATURE.central) throw new Error('Пошкоджений центральний каталог ZIP');
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const nameLength = zip.readUInt16LE(central + 28);
  const extraLength = zip.readUInt16LE(central + 30);
  const commentLength = zip.readUInt16LE(central + 32);
  const localOffset = zip.readUInt32LE(central + 42);
  const path = zip.subarray(central + 46, central + 46 + nameLength).toString('utf8');

  if (zip.readUInt32LE(localOffset) !== SIGNATURE.local) throw new Error(`Пошкоджений локальний заголовок запису «${path}»`);
  const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const body = zip.subarray(dataStart, dataStart + compressedSize);
  if (method !== METHOD_STORE && method !== METHOD_DEFLATE) throw new Error(`Запис «${path}»: непідтримуваний метод стиснення ${method}`);
  const data = method === METHOD_DEFLATE ? inflateRawSync(body) : Buffer.from(body);
  return { entry: { path, data }, next: central + 46 + nameLength + extraLength + commentLength };
}

/** Записи архіву в порядку центрального каталогу; каталоги (шлях закінчується на /) пропускаються. */
export function readZip(zip: Buffer): ZipEntry[] {
  const end = findEndRecord(zip);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const { entry, next } = readEntry(zip, offset);
    if (!entry.path.endsWith('/')) entries.push(entry);
    offset = next;
  }
  return entries;
}

/** Вміст одного запису як UTF-8 текст. */
export function readZipText(zip: Buffer, path: string): string {
  const entry = readZip(zip).find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`У архіві немає файлу ${path}`);
  return Buffer.from(entry.data).toString('utf8');
}
