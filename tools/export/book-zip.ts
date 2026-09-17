import { renderChapters, splitChapters, type ChapterFile } from './book-chapters.ts';
import { cleanArticle } from './book-clean.ts';
import { findElement, hasAttr, parseHtml, type HtmlNode } from './html-tree.ts';
import { createZip, type ZipEntry } from './zip.ts';

/**
 * Сторінка теми з `dist/temy/<slug>/index.html` → ZIP глав для
 * `toolbook_importhtml_import_chapters($zip, 2, ...)`: кожен HTML у корені архіву стає главою Книги,
 * SVG-схеми лежать окремими файлами в `img/` і підставляються в главу через `<img>`.
 *
 * Що прибирається: шапка, навігація, підвал, зміст і бічна колонка (беремо лише статтю теми),
 * скрипти й кнопки, блок результатів навчання й завдання СРС (вони йдуть у Сторінку теми),
 * інтерактивна самоперевірка (замість неї — посилання на тренувальний тест).
 */

export const DEFAULT_IMAGE_DIR = 'img';
export const DEFAULT_PREAMBLE_TITLE = 'Вступ';
export const DEFAULT_TERMS_HEADING = 'Терміни глави';
export const DEFAULT_SELF_CHECK_NOTE =
  'Питання самоперевірки з поясненнями до кожного варіанта — на сайті курсу: пройдіть тренувальний тест теми.';

export interface BookOptions {
  /** Корінь сайту разом із base, напр. https://example.github.io/korporatyvne-upravlinnia/ */
  readonly siteUrl: string;
  readonly imageDir?: string;
  readonly preambleTitle?: string;
  readonly termsHeading?: string;
  readonly selfCheckNote?: string;
}

export interface BookPlan {
  readonly chapters: readonly ChapterFile[];
  readonly images: readonly ZipEntry[];
  readonly warnings: readonly string[];
}

export class BookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookError';
  }
}

/** Стаття теми на сторінці: саме її вміст стає главами. */
function articleOf(html: string): readonly HtmlNode[] {
  const page = parseHtml(html);
  const article = findElement(page, (node) => hasAttr(node, 'data-topic-article'));
  if (article === null) {
    throw new BookError('На сторінці немає статті теми (елемента з data-topic-article): тему ще не опубліковано?');
  }
  return article.children;
}

export function planBook(pageHtml: string, options: BookOptions): BookPlan {
  const imageDir = options.imageDir ?? DEFAULT_IMAGE_DIR;
  const cleaned = cleanArticle(articleOf(pageHtml), {
    imageDir,
    selfCheckNote: options.selfCheckNote ?? DEFAULT_SELF_CHECK_NOTE,
  });
  const chapters = splitChapters(cleaned.nodes, { preambleTitle: options.preambleTitle ?? DEFAULT_PREAMBLE_TITLE });
  if (chapters.length === 0) throw new BookError('Стаття теми не дала жодної глави: немає ані тексту, ані заголовків h2');

  const rendered = renderChapters(chapters, {
    siteUrl: options.siteUrl,
    terms: cleaned.terms,
    termsHeading: options.termsHeading ?? DEFAULT_TERMS_HEADING,
  });
  return {
    chapters: rendered.files,
    images: cleaned.schemes.map((scheme) => ({ path: scheme.path, data: Buffer.from(scheme.contents, 'utf8') })),
    warnings: [...cleaned.warnings, ...rendered.warnings],
  };
}

export function bookZipEntries(plan: BookPlan): ZipEntry[] {
  return [
    ...plan.chapters.map((chapter) => ({ path: chapter.file, data: Buffer.from(chapter.html, 'utf8') })),
    ...plan.images,
  ];
}

export function buildBookZip(pageHtml: string, options: BookOptions): { plan: BookPlan; zip: Buffer } {
  const plan = planBook(pageHtml, options);
  return { plan, zip: createZip(bookZipEntries(plan)) };
}
