import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { chapterTitle, splitChapters } from './book-chapters.ts';
import { collectTermDefinitions } from './book-clean.ts';
import { LIGHT_THEME_COLORS, resolveCssVariables } from './book-svg.ts';
import { BookError, buildBookZip, planBook } from './book-zip.ts';
import { parseHtml, serializeHtml } from './html-tree.ts';

/**
 * Перетворення сторінки теми на глави Книги. Основний вхід — реальна зібрана сторінка
 * `dist/temy/<slug>/index.html`, тому тест на ній позначається як пропущений, якщо сайт ще не зібрано.
 */

const SITE_URL = 'https://youngerfornday.github.io/korporatyvne-upravlinnia/';
const BUILT_PAGE = new URL('../../dist/temy/korporatsiia-i-korporatyvne-upravlinnia/index.html', import.meta.url);

function page(body: string): string {
  return `<!DOCTYPE html><html lang="uk"><head><title>Тема</title></head><body><header>шапка</header>
<main><article class="read" data-topic-article>${body}</article></main><footer>підвал</footer></body></html>`;
}

/** Імена файлів архіву з центрального каталогу ZIP. */
function zipEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  for (let offset = 0; offset < zip.length - 3; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = zip.readUInt16LE(offset + 28);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
  }
  return names;
}

/** Розпаковує перший запис архіву з відомим ім'ям (записи цього архіву — deflate або store). */
function zipEntryData(zip: Buffer, path: string): Buffer {
  for (let offset = 0; offset < zip.length - 3; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) continue;
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    if (name === path) {
      const body = zip.subarray(start, start + compressedSize);
      return method === 8 ? inflateRawSync(body) : Buffer.from(body);
    }
  }
  throw new Error(`У архіві немає файлу ${path}`);
}

describe('розбиття на глави', () => {
  test('кожен h2 починає главу, текст до першого h2 стає вступом', () => {
    const plan = planBook(page('<p>Вступний абзац.</p><h2>Перший розділ</h2><p>Текст.</p><h2>Другий розділ</h2><p>Ще.</p>'), {
      siteUrl: SITE_URL,
    });

    expect(plan.chapters.map((chapter) => chapter.title)).toEqual(['Вступ', 'Перший розділ', 'Другий розділ']);
    expect(plan.chapters.map((chapter) => chapter.file)).toEqual(['chapter-01.html', 'chapter-02.html', 'chapter-03.html']);
  });

  test('номер із заголовка прибирається: нумерацію додає сама Книга', () => {
    const heading = parseHtml('<h2>2.1. Моделі корпоративного управління</h2>')[0];
    expect(heading?.type === 'element' ? chapterTitle(heading) : '').toBe('Моделі корпоративного управління');
  });

  test('секції верхнього рівня розгортаються, щоб їхні h2 теж ділили главу', () => {
    const plan = planBook(page('<h2>Текст</h2><p>a</p><section><h2>Джерела</h2><ol><li>Книга</li></ol></section>'), {
      siteUrl: SITE_URL,
    });
    expect(plan.chapters.map((chapter) => chapter.title)).toEqual(['Текст', 'Джерела']);
  });

  test('глава, у якій лише завдання СРС, у Книгу не потрапляє: вони йдуть у Сторінку теми', () => {
    const plan = planBook(
      page('<h2>Текст</h2><p>a</p><h2>Самостійна робота</h2><div data-srs-task="1.1"><p>Прочитати.</p></div>'),
      { siteUrl: SITE_URL },
    );
    expect(plan.chapters.map((chapter) => chapter.title)).toEqual(['Текст']);
  });

  test('порожня стаття — зрозуміла помилка, а не порожній архів', () => {
    expect(() => planBook(page('   '), { siteUrl: SITE_URL })).toThrow(BookError);
  });

  test('сторінка без статті теми — зрозуміла помилка', () => {
    expect(() => planBook('<html><body><p>ще не опубліковано</p></body></html>', { siteUrl: SITE_URL })).toThrow(
      /data-topic-article/,
    );
  });
});

describe('прибирання інтерактиву', () => {
  test('скрипти, кнопки й поповери зникають, самоперевірка стає поясненням', () => {
    const plan = planBook(
      page(
        '<h2>Розділ</h2><p>Текст<button class="term" type="button" popovertarget="pop-a" data-term="a">корпорацію</button>' +
          '<span id="pop-a" class="pop" popover="auto" data-term-pop><span class="pop-title">Корпорація</span>' +
          '<span>Окрема юридична особа.</span><span class="pop-src"><a href="/korporatyvne-upravlinnia/temy/x/#terminy">Усі</a></span></span>.</p>' +
          '<section data-selfcheck><h2>Самоперевірка</h2><div class="sc-q"><button class="opt">А</button></div>' +
          '<script type="module">console.log(1)</script></section>' +
          '<div class="cta-test" data-topic-quiz-cta><a href="/korporatyvne-upravlinnia/testy/x/">Тест</a></div>',
        ),
      { siteUrl: SITE_URL, selfCheckNote: 'Пройдіть тренувальний тест на сайті.' },
    );
    const html = plan.chapters.map((chapter) => chapter.html).join('\n');

    expect(html).not.toMatch(/<script|<button|popover|data-term|data-selfcheck/i);
    expect(html).toContain('Пройдіть тренувальний тест на сайті.');
    expect(plan.chapters.map((chapter) => chapter.title)).toEqual(['Розділ', 'Самоперевірка']);
  });

  test('термін лишається в тексті, а означення йде зноскою в кінець глави', () => {
    const plan = planBook(
      page(
        '<h2>Розділ</h2><p><button class="term" type="button" popovertarget="pop-a">корпорацію</button> і ще раз ' +
          '<button class="term" type="button" popovertarget="pop-a">корпорація</button>' +
          '<span id="pop-a" data-term-pop><span class="pop-title">Корпорація</span><span>Окрема юридична особа.</span></span></p>',
      ),
      { siteUrl: SITE_URL },
    );
    const chapter = plan.chapters[0] as { html: string; terms: number };

    expect(chapter.terms).toBe(1);
    expect(chapter.html).toMatch(/корпорацію<sup class="ku-term-ref"[^>]*><a href="#ku-term-1">1<\/a><\/sup>/);
    expect(chapter.html).toContain('<li id="ku-term-1"><strong>Корпорація</strong> — Окрема юридична особа.</li>');
  });

  test('означення терміна беруться з поповерів сторінки без блоку джерела', () => {
    const nodes = parseHtml(
      '<span id="pop-a" data-term-pop><span class="pop-title">Кворум</span><span>Мінімум голосів.</span>' +
        '<span class="pop-src">Глосарій</span></span>',
    );
    expect(collectTermDefinitions(nodes).get('pop-a')).toEqual({ title: 'Кворум', definitionHtml: 'Мінімум голосів.' });
  });

  test('розкривні блоки стають звичайними: у Moodle details не гарантовано переживає очищення HTML', () => {
    const plan = planBook(page('<h2>Р</h2><details class="figure-alt"><summary>Опис схеми</summary><p>Текст.</p></details>'), {
      siteUrl: SITE_URL,
    });
    const html = (plan.chapters[0] as { html: string }).html;

    expect(html).not.toMatch(/<details|<summary/);
    expect(html).toContain('class="ku-details figure-alt"');
    expect(html).toContain('<strong>Опис схеми</strong>');
    // Оформлення йде атрибутом style: блок <style> Moodle у главу не переносить.
    expect(html).toMatch(/<div class="ku-details figure-alt" style="[^"]*dashed/);
  });
});

describe('посилання', () => {
  test('внутрішнє посилання сайту стає абсолютним на живий сайт', () => {
    const plan = planBook(page('<h2>Р</h2><p><a href="/korporatyvne-upravlinnia/temy/x/">Тема</a></p>'), { siteUrl: SITE_URL });
    expect((plan.chapters[0] as { html: string }).html).toContain(`href="${SITE_URL}temy/x/"`);
  });

  test('якір на іншу главу переписується на файл глави, у своїй главі лишається як є', () => {
    const plan = planBook(
      page('<h2>Перша</h2><p><a href="#ціль">далі</a> <a href="#тут">тут</a></p><p id="тут">Тут.</p><h2>Друга</h2><p id="ціль">Ціль.</p>'),
      { siteUrl: SITE_URL },
    );
    const first = (plan.chapters[0] as { html: string }).html;

    expect(first).toContain('href="chapter-02.html#ціль"');
    expect(first).toContain('href="#тут"');
  });

  test('якір, якого в Книзі немає, прибирається разом із посиланням, але текст лишається', () => {
    const plan = planBook(page('<h2>Р</h2><p><a href="#terminy">усі терміни</a></p>'), { siteUrl: SITE_URL });

    expect((plan.chapters[0] as { html: string }).html).toContain('<p>усі терміни</p>');
    expect(plan.warnings.some((warning) => warning.includes('#terminy'))).toBe(true);
  });
});

describe('схеми SVG', () => {
  const svgPage = page(
    '<h2>Р</h2><figure><svg id="fig-1" class="scheme" viewBox="0 0 560 420" role="img">' +
      '<title>Рисунок 1. Схема</title><desc>Опис.</desc>' +
      '<style>#fig-1 .box { fill: var(--surface, #ffffff); stroke: var(--ink, #0f1c2e); }</style>' +
      '<rect class="box" x="1" y="1" width="10" height="10"></rect></svg></figure>',
  );

  test('схема виходить окремим файлом, а в главі лишається img з alt із title', () => {
    const plan = planBook(svgPage, { siteUrl: SITE_URL });
    const chapter = (plan.chapters[0] as { html: string }).html;

    expect(plan.images.map((image) => image.path)).toEqual(['img/fig-1.svg']);
    expect(chapter).toContain('<img src="img/fig-1.svg" alt="Рисунок 1. Схема" width="560" height="420"');
    expect(chapter).not.toContain('<svg');
  });

  test('файл схеми самостійний: простір імен є, змінних CSS немає', () => {
    const plan = planBook(svgPage, { siteUrl: SITE_URL });
    const svg = (plan.images[0] as { data: Uint8Array }).data.toString();

    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain('var(--');
    expect(svg).toContain('fill: #ffffff');
  });

  test('змінна без значення за замовчуванням береться з кольорів світлої теми', () => {
    expect(resolveCssVariables('fill: var(--brand)').text).toBe(`fill: ${LIGHT_THEME_COLORS['--brand']}`);
    expect(resolveCssVariables('fill: var(--unknown-token)').unresolved).toEqual(['--unknown-token']);
  });
});

describe('архів', () => {
  test('у ZIP лежать глави в корені й схеми в підкаталозі, вміст читається', () => {
    const { plan, zip } = buildBookZip(page('<h2>Р</h2><p>Текст.</p>'), { siteUrl: SITE_URL });

    expect(zipEntryNames(zip)).toEqual(['chapter-01.html']);
    expect(zipEntryData(zip, 'chapter-01.html').toString('utf8')).toBe((plan.chapters[0] as { html: string }).html);
  });

  test('однаковий вхід дає однаковий байт у байт архів', () => {
    const build = (): Buffer => buildBookZip(page('<h2>Р</h2><p>Текст.</p>'), { siteUrl: SITE_URL }).zip;
    expect(build().equals(build())).toBe(true);
  });
});

describe('зібрана сторінка теми', () => {
  test('реальна сторінка дає глави, схеми і жодного скрипта', async () => {
    const html = await readFile(BUILT_PAGE, 'utf8').catch(() => null);
    if (html === null) return; // сайт ще не зібрано: `npm run build`

    const { plan, zip } = buildBookZip(html, { siteUrl: SITE_URL });
    const chapters = plan.chapters.map((chapter) => chapter.html).join('\n');

    expect(plan.chapters.length).toBeGreaterThan(5);
    expect(plan.images.length).toBeGreaterThan(0);
    expect(chapters).not.toMatch(/<script|<button|popovertarget|data-astro-cid/i);
    expect(chapters).not.toContain('var(--');
    expect(plan.chapters.some((chapter) => chapter.title === 'Самоперевірка')).toBe(true);
    expect(zipEntryNames(zip)).toContain('chapter-01.html');
  });

  test('розбір і серіалізація не змінюють розмітку сторінки', async () => {
    const html = await readFile(BUILT_PAGE, 'utf8').catch(() => null);
    if (html === null) return;

    expect(serializeHtml(parseHtml(html))).toBe(html);
  });
});

describe('splitChapters напряму', () => {
  test('порожній вхід дає порожній список глав', () => {
    expect(splitChapters(parseHtml('   '), { preambleTitle: 'Вступ' })).toEqual([]);
  });
});
