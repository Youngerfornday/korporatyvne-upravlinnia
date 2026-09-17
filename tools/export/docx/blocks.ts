import {
  AlignmentType,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  ExternalHyperlink,
  HeadingLevel,
  HighlightColor,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
  type ParagraphChild,
} from 'docx';
import { typo } from '../../../src/lib/typography/index.ts';

/**
 * Будівельні блоки DOCX: абзаци, заголовки, списки, таблиці й позначки «потребує підтвердження».
 * Увесь текст із course.yaml проходить через ту саму українську типографіку, що й сайт.
 */

/** Ширина поля набору A4 з полями 30/15 мм у twip — від неї рахуються ширини стовпців таблиць. */
export const CONTENT_WIDTH_TWIP = 9355;
export const BODY_SIZE = 28;
export const TABLE_SIZE = 24;
export const FIRST_LINE_INDENT_TWIP = 709;
export const LIST_REFERENCE = { numbered: 'numbered', bullets: 'bullets' } as const;

const numberFormat = new Intl.NumberFormat('uk-UA');

/** «0,5», «1 200»: числа в документах — з українським десятковим знаком. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Шматок рядка: простий текст або текст з оформленням, посиланням чи приміткою для погодження. */
export type Inline =
  | string
  | {
      readonly text: string;
      readonly bold?: boolean;
      readonly italics?: boolean;
      readonly link?: string;
      /** Офіційна назва акта чи видання: дефіс у пробілах не перетворюється на тире. */
      readonly official?: boolean;
      /** ID примітки (коментаря Word): текст виділяється жовтим і отримує примітку. */
      readonly comment?: number | undefined;
    };

export type Align = 'left' | 'center' | 'right' | 'justify';

const ALIGNMENT = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

function runs(parts: readonly Inline[], size: number | undefined): ParagraphChild[] {
  return parts.flatMap((part): ParagraphChild[] => {
    const inline = typeof part === 'string' ? { text: part } : part;
    const text = typo(inline.text, { keepSpacedHyphens: inline.official === true });
    const style = { size, bold: inline.bold, italics: inline.italics };
    if (inline.link !== undefined) {
      return [new ExternalHyperlink({ link: inline.link, children: [new TextRun({ ...style, text, style: 'Hyperlink' })] })];
    }
    if (inline.comment === undefined) return [new TextRun({ ...style, text })];
    return [
      new CommentRangeStart(inline.comment),
      new TextRun({ ...style, text, highlight: HighlightColor.YELLOW }),
      new CommentRangeEnd(inline.comment),
      new TextRun({ children: [new CommentReference(inline.comment)], size }),
    ];
  });
}

function asParts(content: string | readonly Inline[]): readonly Inline[] {
  return typeof content === 'string' ? [content] : content;
}

export interface ParagraphOptions {
  readonly align?: Align;
  readonly indent?: boolean;
  readonly size?: number;
  readonly bold?: boolean;
  readonly keepNext?: boolean;
  readonly spacingAfter?: number;
  readonly pageBreakBefore?: boolean;
}

/** Абзац основного тексту: вирівнювання за шириною й абзацний відступ 1,25 см за замовчуванням. */
export function para(content: string | readonly Inline[], options: ParagraphOptions = {}): Paragraph {
  const parts = asParts(content).map((part) =>
    options.bold === true ? (typeof part === 'string' ? { text: part, bold: true } : { ...part, bold: true }) : part,
  );
  return new Paragraph({
    children: runs(parts, options.size),
    alignment: ALIGNMENT[options.align ?? 'justify'],
    indent: options.indent === false ? undefined : { firstLine: FIRST_LINE_INDENT_TWIP },
    keepNext: options.keepNext,
    pageBreakBefore: options.pageBreakBefore,
    spacing: options.spacingAfter === undefined ? undefined : { after: options.spacingAfter },
  });
}

/** Текст «Підпис: значення» без абзацного відступу. */
export function labeled(label: string, value: string | readonly Inline[]): Paragraph {
  return para([{ text: `${label}: `, bold: true }, ...asParts(value)], { indent: false });
}

export function heading(text: string, level: 1 | 2 = 1): Paragraph {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    children: [new TextRun(typo(text, { nbsp: false }))],
    keepNext: true,
  });
}

/**
 * Нумерований або маркований список. `instance` — номер екземпляра нумерації: різні значення
 * починають нумерацію знову з 1, тому кожен нумерований список документа має свій номер.
 */
export function list(items: ReadonlyArray<string | readonly Inline[]>, kind: 'numbered' | 'bullets', instance = 0): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        children: runs(asParts(item), undefined),
        alignment: AlignmentType.JUSTIFIED,
        numbering: { reference: LIST_REFERENCE[kind], level: 0, instance },
      }),
  );
}

/** Клітинка таблиці: рядок, шматки тексту або готові абзаци. */
export type CellContent = string | readonly Inline[] | { readonly paragraphs: readonly Paragraph[] };

export interface Cell {
  readonly content: CellContent;
  readonly bold?: boolean;
  readonly align?: Align;
  readonly span?: number;
  readonly shaded?: boolean;
}

export interface Column {
  readonly header: string;
  /** Частка ширини таблиці; частки нормуються до ширини поля набору. */
  readonly share: number;
  readonly align?: Align;
}

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const CELL_MARGINS = { left: 85, right: 85 } as const;
const HEADER_SHADE = { type: ShadingType.CLEAR, fill: 'E7E6E6', color: 'auto' } as const;

function isCell(value: Cell | CellContent): value is Cell {
  return typeof value === 'object' && 'content' in value;
}

function cellParagraphs(cell: Cell, align: Align): readonly Paragraph[] {
  const { content } = cell;
  if (typeof content === 'object' && 'paragraphs' in content) return content.paragraphs;
  return [para(content, { align, indent: false, size: TABLE_SIZE, bold: cell.bold === true, spacingAfter: 0 })];
}

function widths(columns: readonly Column[]): number[] {
  const total = columns.reduce((sum, column) => sum + column.share, 0);
  return columns.map((column) => Math.round((CONTENT_WIDTH_TWIP * column.share) / total));
}

/** Таблиця з рядком заголовків, що повторюється на кожній сторінці. */
export function table(columns: readonly Column[], rows: ReadonlyArray<ReadonlyArray<Cell | CellContent>>): Table {
  const columnWidths = widths(columns);
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map(
      (column, index) =>
        new TableCell({
          width: { size: columnWidths[index] ?? 0, type: WidthType.DXA },
          shading: HEADER_SHADE,
          children: cellParagraphs({ content: column.header, bold: true }, 'center'),
        }),
    ),
  });
  const body = rows.map((row) => {
    let columnIndex = 0;
    const cells = row.map((value) => {
      const cell = isCell(value) ? value : { content: value };
      const span = cell.span ?? 1;
      const width = columnWidths.slice(columnIndex, columnIndex + span).reduce((sum, part) => sum + part, 0);
      const align = cell.align ?? columns[columnIndex]?.align ?? 'left';
      columnIndex += span;
      return new TableCell({
        width: { size: width, type: WidthType.DXA },
        columnSpan: span > 1 ? span : undefined,
        shading: cell.shaded === true ? HEADER_SHADE : undefined,
        children: cellParagraphs(cell, align),
      });
    });
    return new TableRow({ cantSplit: true, children: cells });
  });
  return new Table({
    width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
    columnWidths,
    margins: CELL_MARGINS,
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: [header, ...body],
  });
}

/** Абзаци для клітинки: перший рядок жирний (назва), далі — пункти. */
export function cellLines(title: string, lines: readonly string[]): { readonly paragraphs: readonly Paragraph[] } {
  return {
    paragraphs: [
      para(title, { indent: false, align: 'left', size: TABLE_SIZE, bold: true, spacingAfter: 0 }),
      ...lines.map((line) => para(line, { indent: false, align: 'left', size: TABLE_SIZE, spacingAfter: 0 })),
    ],
  };
}

/** Порожній абзац-відступ між таблицею й наступним текстом. */
export function spacer(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 120 } });
}

/** Розділ документа: заголовок першого рівня з номером, вступний вміст і підрозділи «N.M.». */
export interface DocSection {
  readonly title: string;
  readonly children?: readonly FileChild[];
  readonly subsections?: ReadonlyArray<{ readonly title: string; readonly children: readonly FileChild[] }>;
}

export function renderSections(sections: readonly DocSection[]): FileChild[] {
  return sections.flatMap((section, index) => [
    heading(`${index + 1}. ${section.title}`),
    ...(section.children ?? []),
    ...(section.subsections ?? []).flatMap((sub, subIndex) => [heading(`${index + 1}.${subIndex + 1}. ${sub.title}`, 2), ...sub.children]),
  ]);
}
