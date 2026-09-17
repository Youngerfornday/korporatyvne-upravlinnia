import type { Course } from '../../../src/content/schemas/course.ts';
import { list, para, type DocSection, type Inline } from './blocks.ts';
import type { DocContext } from './context.ts';

/** Рекомендована література: основна, додаткова, нормативні акти й стандарти, інформаційні ресурси. */

type Book = Course['literature']['main'][number];

/** Бібліографічний запис у дусі ДСТУ 8302:2015: автори, назва, видання, місце, видавець, рік, ISBN, DOI або URL. */
export function bookReference(book: Book): Inline[] {
  const edition = book.edition === undefined ? '' : ` ${book.edition}`;
  const place = book.place === undefined ? '' : `${book.place} : `;
  const isbn = book.isbn === undefined ? '' : ` ISBN ${book.isbn}.`;
  const link = book.doi ?? book.url;
  return [
    { text: `${book.authors.join(', ')} ${book.title}.`, official: true },
    `${edition} ${place}${book.publisher}, ${book.year}.${isbn} `,
    { text: link, link },
  ];
}

export function literatureSection(ctx: DocContext): DocSection {
  const { literature } = ctx.course;
  return {
    title: 'Рекомендована література та інформаційні ресурси',
    children: [para(literature.verification)],
    subsections: [
      { title: 'Основна література', children: list(literature.main.map(bookReference), 'numbered', ctx.nextListInstance()) },
      { title: 'Додаткова література', children: list(literature.additional.map(bookReference), 'numbered', ctx.nextListInstance()) },
      {
        title: 'Нормативно-правові акти та міжнародні стандарти',
        children: list(
          literature.normative.map((act): Inline[] => [{ text: `${act.title}. `, official: true }, { text: act.url, link: act.url }]),
          'numbered',
          ctx.nextListInstance(),
        ),
      },
      {
        title: 'Інформаційні ресурси',
        children: list(
          [
            [`Сайт курсу «${ctx.course.title}». `, { text: ctx.siteUrl, link: ctx.siteUrl }],
            ...literature.resources.map((resource): Inline[] => [`${resource.title}. `, { text: resource.url, link: resource.url }]),
          ],
          'numbered',
          ctx.nextListInstance(),
        ),
      },
    ],
  };
}
