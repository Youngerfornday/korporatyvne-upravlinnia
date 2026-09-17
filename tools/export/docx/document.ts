import {
  AlignmentType,
  Document,
  Footer,
  LevelFormat,
  LineRuleType,
  PageNumber,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
  type FileChild,
} from 'docx';
import { BODY_SIZE, FIRST_LINE_INDENT_TWIP, LIST_REFERENCE, TABLE_SIZE } from './blocks.ts';
import { commentOptions, NOTE_AUTHOR, type PlacedNote } from './notes.ts';

/**
 * Оформлення університетських документів: Times New Roman 14, поля 20/20/30/15 мм (верхнє, нижнє, ліве, праве),
 * одинарний інтервал, абзацний відступ 1,25 см, номер сторінки внизу по центру, титульна сторінка без номера.
 */

export const FONT = 'Times New Roman';
const MARGINS_MM = { top: 20, bottom: 20, left: 30, right: 15 } as const;
const SINGLE_LINE = 240;
const LIST_INDENT = { left: 709, hanging: 357 } as const;

export interface DocumentMeta {
  readonly title: string;
  readonly subject: string;
  readonly description: string;
  readonly keywords: string;
}

function footer(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: TABLE_SIZE })],
      }),
    ],
  });
}

const STYLES = {
  default: {
    document: {
      run: { font: FONT, size: BODY_SIZE, language: { value: 'uk-UA' } },
      paragraph: { spacing: { line: SINGLE_LINE, lineRule: LineRuleType.AUTO, after: 120 } },
    },
    heading1: {
      run: { font: FONT, size: BODY_SIZE, bold: true, color: '000000' },
      paragraph: { spacing: { before: 360, after: 180 }, keepNext: true, keepLines: true },
    },
    heading2: {
      run: { font: FONT, size: BODY_SIZE, bold: true, italics: true, color: '000000' },
      paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, keepLines: true, indent: { firstLine: FIRST_LINE_INDENT_TWIP } },
    },
    hyperlink: { run: { color: '0B4F8A', underline: {} } },
  },
} as const;

const NUMBERING = {
  config: [
    {
      reference: LIST_REFERENCE.numbered,
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: LIST_INDENT } } }],
    },
    {
      reference: LIST_REFERENCE.bullets,
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: LIST_INDENT } } }],
    },
  ],
};

/** Документ з титульною сторінкою (без номера) і основною частиною в одному розділі A4. */
export function courseDocument(meta: DocumentMeta, children: readonly FileChild[], notes: readonly PlacedNote[], date: Date): Document {
  return new Document({
    title: meta.title,
    subject: meta.subject,
    description: meta.description,
    keywords: meta.keywords,
    creator: NOTE_AUTHOR,
    lastModifiedBy: NOTE_AUTHOR,
    styles: STYLES,
    numbering: NUMBERING,
    comments: { children: commentOptions(notes, date) },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: {
              top: convertMillimetersToTwip(MARGINS_MM.top),
              bottom: convertMillimetersToTwip(MARGINS_MM.bottom),
              left: convertMillimetersToTwip(MARGINS_MM.left),
              right: convertMillimetersToTwip(MARGINS_MM.right),
            },
          },
        },
        footers: { default: footer(), first: new Footer({ children: [] }) },
        children,
      },
    ],
  });
}
