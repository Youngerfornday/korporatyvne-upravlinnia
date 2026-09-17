import { describe, expect, test } from 'vitest';
import { readZip, readZipText } from './unzip.ts';
import { createZip } from './zip.ts';

describe('readZip', () => {
  test('читає записи createZip у тому ж порядку: стиснені й збережені без стиснення', () => {
    const entries = [
      { path: 'README.txt', data: Buffer.from('Корпоративне управління '.repeat(20), 'utf8') },
      { path: 'm1/tiny.bin', data: Uint8Array.from([1, 2, 3]) },
    ];
    const zip = createZip(entries);
    const read = readZip(zip);
    expect(read.map((entry) => entry.path)).toEqual(['README.txt', 'm1/tiny.bin']);
    expect(Buffer.from(read[0]?.data ?? []).toString('utf8')).toBe(Buffer.from(entries[0]?.data ?? []).toString('utf8'));
    expect([...(read[1]?.data ?? [])]).toEqual([1, 2, 3]);
    expect(readZipText(zip, 'README.txt')).toContain('Корпоративне управління');
  });

  test('пропускає записи каталогів', () => {
    const zip = createZip([{ path: 'folder/', data: new Uint8Array() }, { path: 'folder/a.txt', data: Buffer.from('a') }]);
    expect(readZip(zip).map((entry) => entry.path)).toEqual(['folder/a.txt']);
  });

  test('пояснює, коли файл не ZIP, запису немає або метод стиснення невідомий', () => {
    expect(() => readZip(Buffer.from('не архів, а просто текст'))).toThrow('Це не ZIP-архів');
    const zip = createZip([{ path: 'a.txt', data: Buffer.from('a') }]);
    expect(() => readZipText(zip, 'b.txt')).toThrow('У архіві немає файлу b.txt');
    const broken = Buffer.from(zip);
    const central = broken.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    broken.writeUInt16LE(99, central + 10);
    expect(() => readZip(broken)).toThrow('непідтримуваний метод стиснення 99');
    const badLocal = Buffer.from(zip);
    badLocal.writeUInt32LE(0, 0);
    expect(() => readZip(badLocal)).toThrow('Пошкоджений локальний заголовок');
    const badCentral = Buffer.from(zip);
    badCentral.writeUInt32LE(0, central);
    expect(() => readZip(badCentral)).toThrow('Пошкоджений центральний каталог');
  });
});
