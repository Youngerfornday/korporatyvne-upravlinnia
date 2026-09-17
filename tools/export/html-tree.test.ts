import { describe, expect, test } from 'vitest';
import {
  attr,
  classList,
  decodeEntities,
  findElement,
  findElements,
  hasAttr,
  hasClass,
  isBlank,
  isElement,
  mapElements,
  parseHtml,
  serializeHtml,
  textOf,
} from './html-tree.ts';
import { createZip, crc32 } from './zip.ts';

/** Сканер HTML для експортерів: вимога — розібране й серіалізоване назад дає той самий текст. */

function roundTrip(source: string): string {
  return serializeHtml(parseHtml(source));
}

describe('розбір і серіалізація', () => {
  test.each([
    ['порожні теги', '<p>текст<br>ще<hr></p>'],
    ['самозакривний тег SVG', '<svg viewBox="0 0 10 10"><path d="M0 0" /></svg>'],
    ['коментар і doctype', '<!DOCTYPE html><!-- нотатка --><p>текст</p>'],
    ['сирий текст скрипта', '<script>if (a < b) { }</script><style>.a { color: red }</style>'],
    ['атрибут без значення', '<input type="checkbox" checked>'],
    ['вкладеність і сутності', '<p>Альфа &amp; Бета <em>і</em> «лапки»</p>'],
  ])('%s повертається без змін', (_name, source) => {
    expect(roundTrip(source)).toBe(source);
  });

  test('значення атрибутів завжди виводяться в подвійних лапках: Книга Moodle переписує лише такі', () => {
    expect(roundTrip('<div class=note data-x=1>текст</div>')).toBe('<div class="note" data-x="1">текст</div>');
  });

  test('регістр назв тегів і атрибутів SVG зберігається: SVG до нього чутливий', () => {
    const source = '<svg viewBox="0 0 2 2"><linearGradient id="g"><stop offset="0"></stop></linearGradient></svg>';
    expect(roundTrip(source)).toBe(source);
  });

  test('зайвий закривальний тег не ламає розбір', () => {
    expect(roundTrip('<div><p>текст</p></span></div>')).toBe('<div><p>текст</p></div>');
  });

  test('незакритий тег закривається в кінці документа', () => {
    expect(roundTrip('<div><p>текст')).toBe('<div><p>текст</p></div>');
  });
});

describe('пошук і зміна', () => {
  const nodes = parseHtml('<div class="a b" id="root"><p data-x>перший</p><p>другий</p></div>');

  test('атрибути читаються без урахування регістру назви', () => {
    const div = findElement(nodes, (node) => node.tag === 'div');
    expect(div === null ? null : attr(div, 'id')).toBe('root');
    expect(div === null ? null : classList(div)).toEqual(['a', 'b']);
    expect(div === null ? false : hasClass(div, 'b')).toBe(true);
  });

  test('атрибут без значення знаходиться, але значення в нього немає', () => {
    const paragraph = findElement(nodes, (node) => hasAttr(node, 'data-x'));
    expect(paragraph === null ? null : attr(paragraph, 'data-x')).toBeNull();
  });

  test('findElement повертає null, якщо нічого не знайдено', () => {
    expect(findElement(nodes, (node) => node.tag === 'table')).toBeNull();
    expect(findElements(nodes, (node) => node.tag === 'p')).toHaveLength(2);
  });

  test('mapElements замінює елемент і не заходить у заміну', () => {
    const changed = mapElements(nodes, (node) => (node.tag === 'p' ? [] : null));
    expect(serializeHtml(changed)).toBe('<div class="a b" id="root"></div>');
  });

  test('textOf розкриває базові сутності, isElement звіряє назву тега', () => {
    expect(textOf(parseHtml('<p>Альфа &amp; Бета&nbsp;— так</p>'))).toBe('Альфа & Бета — так');
    expect(decodeEntities('&#1030;&#x406;&невідома;')).toBe('ІІ&невідома;');
    expect(isElement(parseHtml('<p>a</p>')[0] as never, 'p')).toBe(true);
  });

  test('isBlank відрізняє порожній текст від елемента', () => {
    const [space, paragraph] = parseHtml('   <p>a</p>');
    expect(isBlank(space as never)).toBe(true);
    expect(isBlank(paragraph as never)).toBe(false);
  });
});

describe('архів', () => {
  test('контрольна сума CRC32 збігається з еталонною', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  test('некоректний шлях усередині архіву — помилка, а не мовчазний запис', () => {
    expect(() => createZip([{ path: '/абсолютний', data: Buffer.from('a') }])).toThrow(/Некоректний шлях/);
    expect(() => createZip([{ path: '../назовні', data: Buffer.from('a') }])).toThrow(/Некоректний шлях/);
  });

  test('дублікат шляху — помилка', () => {
    const entry = { path: 'a.html', data: Buffer.from('a') };
    expect(() => createZip([entry, entry])).toThrow(/Дублікат/);
  });

  test('дані, які не стискаються, зберігаються без стиснення', () => {
    const random = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 37) % 251));
    const zip = createZip([{ path: 'a.bin', data: random }]);
    expect(zip.includes(random)).toBe(true);
  });
});
