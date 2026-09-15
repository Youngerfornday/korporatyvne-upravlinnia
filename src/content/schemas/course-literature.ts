import { z } from 'zod';
import { ResearchRefSchema } from './course-shared';
import { HttpUrlSchema, KebabIdSchema, NonEmptyTextSchema } from './primitives';

/**
 * Список літератури. Лише видання, існування яких перевірено (ISBN, DOI або сторінка видавця/каталогу).
 * ISBN — 13 цифр без дефісів: лінт типографіки замінює дефіс між цифрами на тире.
 */

/** Аудит старого курсу: 19 з 20 джерел були до 2015 р.; курс спирається на сучасні видання. */
export const MIN_LITERATURE_YEAR = 2016;
const MAX_YEAR = 2100;
const ISBN_13_LENGTH = 13;

/** Контрольна цифра ISBN-13: зважена сума (1, 3, 1, 3, …) кратна 10. */
export function isValidIsbn13(isbn: string): boolean {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  const digits = [...isbn].map(Number);
  const weighted = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return digits.length === ISBN_13_LENGTH && weighted % 10 === 0;
}

const IsbnSchema = z.string().refine(isValidIsbn13, { message: 'ISBN-13 має 13 цифр без дефісів і правильну контрольну цифру' });
const DoiUrlSchema = HttpUrlSchema.refine((url) => /^https:\/\/doi\.org\/10\.\d{4,9}\/\S+$/.test(url), {
  message: 'DOI записується як https://doi.org/10.…',
});

const BookSchema = z.object({
  id: KebabIdSchema,
  authors: z.array(NonEmptyTextSchema).min(1),
  title: NonEmptyTextSchema,
  edition: NonEmptyTextSchema.optional(),
  place: NonEmptyTextSchema.optional(),
  publisher: NonEmptyTextSchema,
  year: z.int().min(MIN_LITERATURE_YEAR).max(MAX_YEAR),
  isbn: IsbnSchema.optional(),
  doi: DoiUrlSchema.optional(),
  url: HttpUrlSchema,
  language: z.enum(['uk', 'en']),
});

export const LiteratureSchema = z.object({
  verification: NonEmptyTextSchema,
  main: z.array(BookSchema).min(3).max(5),
  additional: z.array(BookSchema).min(5).max(8),
  /** Нормативні акти й міжнародні стандарти — розділи legal-baseline.md. */
  normative: z.array(z.object({ title: NonEmptyTextSchema, ref: ResearchRefSchema, url: HttpUrlSchema })).min(1),
  resources: z.array(z.object({ title: NonEmptyTextSchema, url: HttpUrlSchema })).min(1),
});
