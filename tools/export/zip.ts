import { deflateRawSync } from 'node:zlib';

/**
 * Відтворюваний ZIP без зовнішніх залежностей (stdlib `zlib`): архів глав Книги для
 * `toolbook_importhtml_import_chapters()`. Час файлів фіксований, порядок записів — той, що переданий,
 * тож однаковий вхід завжди дає однаковий байт у байт архів (зручно для снапшот-тестів і кешу).
 */

export interface ZipEntry {
  /** Шлях усередині архіву з прямими скісними рисками, без початкової. */
  readonly path: string;
  readonly data: Uint8Array;
}

/** 2026-01-01 00:00 у форматі MS-DOS: дата не несе змісту, а фіксована робить архів відтворюваним. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const SIGNATURE = { local: 0x04034b50, central: 0x02014b50, end: 0x06054b50 } as const;
const VERSION_MADE_BY = 0x031e; // UNIX, ZIP 3.0
const VERSION_NEEDED = 20;
const FLAG_UTF8 = 0x0800;
const METHOD_DEFLATE = 8;
const METHOD_STORE = 0;
const EXTERNAL_ATTRIBUTES = 0o644 << 16;

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface PreparedEntry {
  readonly name: Buffer;
  readonly crc: number;
  readonly method: number;
  readonly compressed: Buffer;
  readonly size: number;
  readonly offset: number;
}

function localHeader(entry: PreparedEntry): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(SIGNATURE.local, 0);
  header.writeUInt16LE(VERSION_NEEDED, 4);
  header.writeUInt16LE(FLAG_UTF8, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressed.length, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader(entry: PreparedEntry): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(SIGNATURE.central, 0);
  header.writeUInt16LE(VERSION_MADE_BY, 4);
  header.writeUInt16LE(VERSION_NEEDED, 6);
  header.writeUInt16LE(FLAG_UTF8, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressed.length, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(EXTERNAL_ATTRIBUTES, 38);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function endRecord(count: number, centralSize: number, centralOffset: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(SIGNATURE.end, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

function checkPath(path: string): void {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
    throw new Error(`Некоректний шлях усередині архіву: «${path}»`);
  }
}

/** Збирає ZIP у пам'яті. Стиснення — deflate; якщо воно не зменшує файл, запис зберігається без стиснення. */
export function createZip(entries: readonly ZipEntry[]): Buffer {
  const seen = new Set<string>();
  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    checkPath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Дублікат шляху в архіві: «${entry.path}»`);
    seen.add(entry.path);

    const data = Buffer.from(entry.data);
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const item: PreparedEntry = {
      name: Buffer.from(entry.path, 'utf8'),
      crc: crc32(data),
      method: useDeflate ? METHOD_DEFLATE : METHOD_STORE,
      compressed: useDeflate ? deflated : data,
      size: data.length,
      offset,
    };
    prepared.push(item);
    offset += 30 + item.name.length + item.compressed.length;
  }

  const localParts = prepared.flatMap((entry) => [localHeader(entry), entry.name, entry.compressed]);
  const centralParts = prepared.flatMap((entry) => [centralHeader(entry), entry.name]);
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  return Buffer.concat([...localParts, ...centralParts, endRecord(prepared.length, centralSize, offset)]);
}
