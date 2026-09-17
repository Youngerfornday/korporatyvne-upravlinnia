import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pptxgen from 'pptxgenjs';
import type { Course } from '../../../src/content/schemas/course.ts';
import type { Slide, SlidesFile } from '../../../src/content/schemas/slides.ts';
import type { Source, SourcesFile } from '../../../src/content/schemas/sources.ts';
import { normalizeTypography } from '../../../src/lib/typography/normalize.ts';
import { sectionsOf, slideHeading, slideKicker } from '../../../src/components/slides/slides-pure.ts';
import { createZip, type ZipEntry } from '../zip.ts';
import { readZip } from '../unzip.ts';
import { rasterizeSvg, svgAspectRatio, type SvgRenderer } from './figures.ts';

export const SLIDE_WIDTH = 13.333;
export const SLIDE_HEIGHT = 7.5;

const COLORS = {
  blue: '004F8F',
  deepBlue: '002D5D',
  lavender: 'A59FCE',
  background: 'FCFCFC',
  surface: 'FFFFFF',
  tint: 'EEF4FA',
  ink: '0F1C2E',
  ink2: '445570',
  ink3: '5F6F88',
  line: 'E3E8EF',
  lineStrong: 'C9D2DE',
  lavenderInk: '5F579B',
  teal: '00796B',
} as const;

const FONT = 'Open Sans';
const LOGO_RATIO = 459 / 760;
const DEFAULT_DATE = '2026-09-17';
export const SOURCE_LINE_CHAR_LIMIT = 80;

export interface BuildOptions {
  readonly rootDir?: string;
  readonly topicDir?: string;
  readonly date?: string;
  readonly logoPath?: string;
  readonly logoWhitePath?: string;
  readonly figureRenderer?: SvgRenderer;
}

type PptxSlide = ReturnType<pptxgen['addSlide']>;

function text(value: string): string {
  return normalizeTypography(value);
}

function safeDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`Дата експорту має формат РРРР-ММ-ДД: «${value}»`);
  return value;
}

function sourceItems(sources: SourcesFile | readonly Source[]): readonly Source[] {
  return 'sources' in sources ? sources.sources : sources;
}

function caseName(course: Course, id: string): string {
  const item = course.cases.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Кейс «${id}» не зареєстровано в course.yaml`);
  return item.title;
}

function prnLabel(course: Course, id: string): string {
  const registered = course.learningOutcomes.find((outcome) => outcome.id === id);
  if (registered?.code) return registered.code;
  const number = Number.parseInt(id.replace(/^prn/u, ''), 10);
  return Number.isNaN(number) ? id : `ПРН ${number}`;
}

function addText(slide: PptxSlide, value: string, options: Record<string, unknown>): void {
  slide.addText(text(value), { fontFace: FONT, lang: 'uk-UA', margin: 0, fit: 'shrink', ...options });
}

function addLine(slide: PptxSlide, x: number, y: number, w: number, color: string = COLORS.line): void {
  slide.addShape('line', { x, y, w, h: 0, line: { color, width: 1 } });
}

function addListItem(slide: PptxSlide, value: string, options: { x: number; y: number; w: number; h: number; fontSize: number; color?: string; number?: number }): void {
  const bullet = options.number === undefined
    ? { characterCode: '2022', indent: 16 }
    : { type: 'number' as const, numberType: 'arabicPlain' as const, numberStartAt: options.number, indent: 16 };
  addText(slide, value, {
    x: options.x,
    y: options.y,
    w: options.w,
    h: options.h,
    fontSize: options.fontSize,
    color: options.color ?? COLORS.ink,
    bullet,
    breakLine: false,
    valign: 'mid',
  });
}

function addBullets(slide: PptxSlide, bullets: readonly string[], x: number, y: number, w: number, h: number, fontSize = 20, color = COLORS.ink): void {
  const rowHeight = h / bullets.length;
  bullets.forEach((bullet, index) => {
    const rowY = y + index * rowHeight;
    addListItem(slide, bullet, { x, y: rowY, w, h: rowHeight - 0.08, fontSize, color });
  });
}

function addOrbits(slide: PptxSlide, section = false): void {
  const x = section ? 6.8 : 7.2;
  const y = section ? 0.38 : 0.2;
  const size = section ? 6.2 : 5.9;
  const circles = [
    { inset: 1.45, transparency: 20, dash: undefined },
    { inset: 0.92, transparency: 30, dash: 'dash' },
    { inset: 0.43, transparency: 40, dash: 'dash' },
    { inset: 0, transparency: 50, dash: 'dash' },
  ];
  for (const circle of circles) {
    slide.addShape('ellipse', {
      x: x + circle.inset / 2,
      y: y + circle.inset / 2,
      w: size - circle.inset,
      h: size - circle.inset,
      fill: { color: COLORS.deepBlue, transparency: 100 },
      line: { color: COLORS.lavender, width: 1, transparency: circle.transparency, ...(circle.dash ? { dashType: 'dash' as const } : {}) },
    });
  }
  const dots = [
    [x + size * 0.65, y + size * 0.5, 0.08],
    [x + size * 0.5, y + size * 0.22, 0.1],
    [x + size * 0.2, y + size * 0.32, 0.07],
    [x + size * 0.86, y + size * 0.68, 0.12],
    [x + size * 0.5, y + size * 0.5, 0.14],
  ] as const;
  dots.forEach(([dotX, dotY, dotSize]) => slide.addShape('ellipse', { x: dotX - dotSize / 2, y: dotY - dotSize / 2, w: dotSize, h: dotSize, fill: { color: COLORS.lavender }, line: { color: COLORS.lavender, transparency: 100 } }));
}

function shorten(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function authorSurname(author: string): string {
  const normalized = author.replace(/\s+/gu, ' ').trim();
  const trailingInitials = normalized.match(/^(.*?)(?:\s+[A-ZА-ЯІЇЄҐ]\.)+$/u);
  if (trailingInitials?.[1]) return trailingInitials[1].trim();
  const leadingInitials = normalized.match(/^(?:[A-ZА-ЯІЇЄҐ]\.\s*)+(.+)$/u);
  return leadingInitials?.[1]?.trim() ?? normalized;
}

function shortSource(source: Source): string {
  let label: string;
  if (source.authors.length > 0 && source.year !== undefined) {
    const authors = source.authors.map(authorSurname);
    const authorLabel = authors.length >= 3
      ? `${authors[0]} та ін.`
      : authors.length === 2
        ? `${authors[0]} і ${authors[1]}`
        : authors[0] ?? '';
    label = authorLabel;
  } else {
    label = shorten(source.publisher ?? source.title, 50);
  }
  return source.year === undefined ? label : `${label} (${source.year})`;
}

export function compactSourceLabel(slideSources: readonly Source[]): string {
  const labels = slideSources.map(shortSource);
  const lines: string[] = [];
  let current = 'Джерела:';
  let nextIndex = 0;
  for (; nextIndex < labels.length; nextIndex += 1) {
    const candidate = `${current} ${labels[nextIndex]}`;
    if (candidate.length <= SOURCE_LINE_CHAR_LIMIT) {
      current = candidate;
    } else {
      lines.push(current);
      current = labels[nextIndex] ?? '';
      break;
    }
  }
  if (nextIndex === labels.length) {
    lines.push(current);
    return lines.join('\n');
  }

  for (nextIndex += 1; nextIndex < labels.length; nextIndex += 1) {
    const candidate = `${current}; ${labels[nextIndex]}`;
    if (candidate.length <= SOURCE_LINE_CHAR_LIMIT) {
      current = candidate;
      continue;
    }
    const remaining = labels.length - nextIndex;
    const suffix = `та ще ${remaining}`;
    current = current.length + 2 + suffix.length <= SOURCE_LINE_CHAR_LIMIT ? `${current}; ${suffix}` : `${current} ${suffix}`;
    lines.push(current);
    return lines.join('\n');
  }
  lines.push(current);
  return lines.join('\n');
}

function addSources(slide: PptxSlide, slideSources: readonly Source[], y = 6.38, light = false): void {
  if (slideSources.length === 0) return;
  addText(slide, compactSourceLabel(slideSources), { x: 0.62, y, w: 12.1, h: 0.42, fontSize: 9, color: light ? 'C9DCF0' : COLORS.ink3, valign: 'mid' });
}

function addFooter(slide: PptxSlide, course: Course, topic: { title: string }, number: number, logoPath: string): void {
  addLine(slide, 0.62, 6.78, 12.1);
  slide.addImage({ path: logoPath, x: 0.62, y: 6.9, w: 0.56, h: 0.56 * LOGO_RATIO, altText: course.institutionShort });
  addText(slide, topic.title, { x: 1.35, y: 6.87, w: 9.7, h: 0.27, fontSize: 9, color: COLORS.ink3, valign: 'mid' });
  addText(slide, String(number), { x: 11.6, y: 6.87, w: 1.12, h: 0.27, fontSize: 10, color: COLORS.ink2, bold: true, align: 'right', valign: 'mid' });
}

function addHeader(slide: PptxSlide, slideData: Slide, heading: string, kicker: string | undefined): number {
  if (kicker) addText(slide, kicker, { x: 0.62, y: 0.32, w: 12.1, h: 0.22, fontSize: 10, bold: true, charSpacing: 1.2, color: COLORS.ink3, valign: 'mid' });
  const title = slideData.type === 'question' ? slideData.prompt : slideData.type === 'quote' ? heading : heading;
  const titleSize = slideData.type === 'question' ? 23 : 26;
  addText(slide, title, { x: 0.62, y: 0.63, w: 12.1, h: slideData.type === 'question' ? 0.82 : 0.58, fontSize: titleSize, bold: true, color: COLORS.ink, valign: 'mid' });
  const lineY = slideData.type === 'question' ? 1.56 : 1.34;
  addLine(slide, 0.62, lineY, 12.1, COLORS.ink);
  return lineY + 0.24;
}

function addBandFooter(slide: PptxSlide, course: Course): void {
  addLine(slide, 0.62, 6.72, 12.1, '557EA5');
  addText(slide, `Корпоративне управління · ${course.institutionShort}`, { x: 0.62, y: 6.87, w: 12.1, h: 0.27, fontSize: 10, color: 'C9DCF0', valign: 'mid' });
}

function addTitleSlide(slide: PptxSlide, slideData: Extract<Slide, { type: 'title' }>, course: Course, topic: { title: string }, moduleNumber: number, moduleTitle: string, logoWhitePath: string): void {
  slide.background = { color: COLORS.deepBlue };
  addOrbits(slide);
  const logoHeight = 0.75;
  slide.addImage({ path: logoWhitePath, x: 0.62, y: 0.52, w: logoHeight / LOGO_RATIO, h: logoHeight, altText: course.institution });
  addText(slide, `Модуль ${moduleNumber}. ${moduleTitle}`, { x: 0.62, y: 2.2, w: 7.8, h: 0.3, fontSize: 13, bold: true, charSpacing: 1.1, color: 'C9DCF0' });
  addText(slide, topic.title, { x: 0.62, y: 2.65, w: 7.8, h: 1.3, fontSize: 39, bold: true, color: 'FFFFFF', valign: 'mid' });
  if (slideData.subtitle) addText(slide, slideData.subtitle, { x: 0.62, y: 4.2, w: 7.2, h: 0.65, fontSize: 19, color: 'C9DCF0', valign: 'top' });
  addBandFooter(slide, course);
}

function addSectionSlide(slide: PptxSlide, slideData: Extract<Slide, { type: 'section' }>): void {
  slide.background = { color: COLORS.blue };
  addOrbits(slide, true);
  addText(slide, slideData.number === undefined ? ' ' : String(slideData.number), { x: 0.62, y: 1.6, w: 2.1, h: 1.2, fontSize: 66, color: COLORS.lavender, valign: 'mid' });
  addText(slide, slideData.title, { x: 2.2, y: 2.05, w: 7.6, h: 1.25, fontSize: 34, bold: true, color: 'FFFFFF', valign: 'mid' });
}

function addContent(slide: PptxSlide, slideData: Slide, course: Course, topic: Course['topics'][number], bodyY: number, figurePng: Buffer | undefined, figureSvg: string | undefined, caseTitle: string | undefined): void {
  const bodyH = 4.65;
  switch (slideData.type) {
    case 'outcomes': {
      const results = topic.results;
      const rowH = bodyH / Math.max(results.length, 1);
      results.forEach((result, index) => {
        const y = bodyY + index * rowH;
        addLine(slide, 0.62, y, 12.1);
        result.prn.forEach((prn, prnIndex) => addText(slide, prnLabel(course, prn), { x: 0.72, y: y + 0.16 + prnIndex * 0.22, w: 1.18, h: 0.25, fontSize: 11, bold: true, color: COLORS.lavenderInk, valign: 'mid' }));
        addText(slide, result.statement, { x: 2.02, y: y + 0.1, w: 10.45, h: rowH - 0.15, fontSize: 17, color: COLORS.ink, valign: 'mid' });
      });
      break;
    }
    case 'bullets':
      addBullets(slide, slideData.bullets, 0.84, bodyY + 0.08, 11.55, bodyH - 0.15, 20);
      break;
    case 'summary':
      slideData.bullets.forEach((bullet, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = 0.72 + col * 6.0;
        const y = bodyY + row * 1.38;
        addLine(slide, x, y, 5.42);
        addListItem(slide, bullet, { x, y: y + 0.12, w: 5.25, h: 0.86, fontSize: 18, color: COLORS.ink, number: index + 1 });
      });
      break;
    case 'two-columns': {
      const columns = [slideData.left, slideData.right];
      columns.forEach((column, index) => {
        const x = index === 0 ? 0.72 : 6.86;
        addText(slide, column.heading, { x, y: bodyY, w: 5.6, h: 0.46, fontSize: 19, bold: true, color: COLORS.ink, valign: 'mid' });
        addLine(slide, x, bodyY + 0.56, 5.55, COLORS.blue);
        addBullets(slide, column.bullets, x + 0.08, bodyY + 0.78, 5.42, 3.86, 18);
      });
      break;
    }
    case 'figure': {
      if (!figurePng || !figureSvg) throw new Error(`Для слайда «${slideData.id}» не підготовлено PNG-схему`);
      const ratio = svgAspectRatio(figureSvg);
      const w = Math.min(8.0, ratio * 4.0);
      const h = w / ratio;
      const x = (SLIDE_WIDTH - w) / 2;
      slide.addImage({ data: `data:image/png;base64,${figurePng.toString('base64')}`, x, y: bodyY + 0.05, w, h, altText: slideData.caption });
      addText(slide, slideData.caption, { x: 1.35, y: Math.min(bodyY + h + 0.18, 5.9), w: 10.65, h: 0.52, fontSize: 12, color: COLORS.ink2, align: 'center', valign: 'mid' });
      break;
    }
    case 'norm':
      slide.addShape('roundRect', { x: 0.8, y: bodyY + 0.44, w: 11.72, h: 3.35, rectRadius: 0.06, fill: { color: COLORS.tint }, line: { color: COLORS.tint, transparency: 100 } });
      slide.addShape('hexagon', { x: 1.15, y: bodyY + 0.87, w: 0.46, h: 0.52, fill: { color: COLORS.lavender }, line: { color: COLORS.lavender, transparency: 100 } });
      addText(slide, slideData.text, { x: 1.95, y: bodyY + 0.78, w: 9.9, h: 1.9, fontSize: 21, italic: true, color: '1D3557', valign: 'mid' });
      addText(slide, `${slideData.lawRef.act}, ${slideData.lawRef.article}`, { x: 1.95, y: bodyY + 2.78, w: 9.75, h: 0.32, fontSize: 10, color: COLORS.ink2, valign: 'mid' });
      addText(slide, `перевірено ${formatCheckedAt(slideData.lawRef.checkedAt)}`, { x: 10.0, y: bodyY + 2.78, w: 2.15, h: 0.32, fontSize: 10, color: COLORS.teal, align: 'right', valign: 'mid' });
      break;
    case 'formula':
      slide.addShape('roundRect', { x: 0.82, y: bodyY + 0.3, w: 11.7, h: 1.38, rectRadius: 0.04, fill: { color: COLORS.surface }, line: { color: COLORS.lineStrong, width: 1 } });
      slide.addShape('rect', { x: 0.82, y: bodyY + 0.3, w: 0.08, h: 1.38, fill: { color: COLORS.blue }, line: { color: COLORS.blue, transparency: 100 } });
      addText(slide, 'Формула', { x: 1.18, y: bodyY + 0.55, w: 1.4, h: 0.25, fontSize: 10, bold: true, charSpacing: 1.1, color: COLORS.ink3 });
      addText(slide, slideData.formula, { x: 1.18, y: bodyY + 0.9, w: 10.7, h: 0.46, fontSize: 22, bold: true, color: COLORS.ink, valign: 'mid' });
      addBullets(slide, slideData.explanation, 0.84, bodyY + 2.0, 11.55, 2.45, 18);
      break;
    case 'case':
      if (!caseTitle) throw new Error(`Для слайда «${slideData.id}» не знайдено назву кейсу`);
      addText(slide, `Кейс з реєстру: ${caseTitle}`, { x: 0.72, y: bodyY, w: 11.82, h: 0.38, fontSize: 13, bold: true, color: COLORS.lavenderInk, valign: 'mid' });
      const colCount = 2;
      const rowCount = Math.ceil(slideData.facts.length / colCount);
      const factH = Math.min(0.8, 2.75 / rowCount);
      slideData.facts.forEach((fact, index) => {
        const col = Math.floor(index / rowCount);
        const row = index % rowCount;
        const x = 0.72 + col * 6.1;
        const y = bodyY + 0.58 + row * factH;
        addLine(slide, x, y, 5.42);
        slide.addShape('ellipse', { x, y: y + 0.13, w: 0.28, h: 0.28, fill: { color: COLORS.surface }, line: { color: COLORS.ink, width: 1 } });
        addText(slide, String(index + 1), { x: x + 0.02, y: y + 0.17, w: 0.24, h: 0.17, fontSize: 8, bold: true, color: COLORS.ink, align: 'center', valign: 'mid' });
        addText(slide, fact, { x: x + 0.45, y: y + 0.08, w: 4.92, h: factH - 0.12, fontSize: 14, color: COLORS.ink, valign: 'mid' });
      });
      slide.addShape('roundRect', { x: 0.82, y: bodyY + 3.43, w: 11.7, h: 0.98, rectRadius: 0.05, fill: { color: COLORS.tint }, line: { color: COLORS.tint, transparency: 100 } });
      addText(slide, 'Питання для обговорення', { x: 1.1, y: bodyY + 3.65, w: 2.9, h: 0.2, fontSize: 10, bold: true, charSpacing: 0.8, color: COLORS.lavenderInk });
      addText(slide, slideData.question, { x: 4.0, y: bodyY + 3.55, w: 8.1, h: 0.42, fontSize: 16, bold: true, color: '1D3557', valign: 'mid' });
      break;
    case 'quote':
      addText(slide, '«', { x: 0.8, y: bodyY + 0.25, w: 0.7, h: 0.8, fontSize: 50, color: COLORS.lavender, bold: true });
      addText(slide, slideData.text, { x: 1.55, y: bodyY + 0.68, w: 10.65, h: 1.55, fontSize: 26, italic: true, color: COLORS.ink, valign: 'mid' });
      addText(slide, `— ${slideData.attribution}`, { x: 1.55, y: bodyY + 2.75, w: 10.65, h: 0.35, fontSize: 15, color: COLORS.ink2 });
      break;
    case 'question':
      if (slideData.options.length > 0) {
        const rowH = 0.83;
        slideData.options.forEach((option, index) => {
          const y = bodyY + index * 1.02;
          slide.addShape('roundRect', { x: 0.84, y, w: 10.6, h: rowH, rectRadius: 0.04, fill: { color: COLORS.surface }, line: { color: COLORS.lineStrong, width: 1 } });
          slide.addShape('ellipse', { x: 1.1, y: y + 0.21, w: 0.4, h: 0.4, fill: { color: COLORS.surface }, line: { color: COLORS.lineStrong, width: 1 } });
          addText(slide, optionLetter(index), { x: 1.1, y: y + 0.29, w: 0.4, h: 0.18, fontSize: 10, bold: true, color: COLORS.ink2, align: 'center', valign: 'mid' });
          addText(slide, option, { x: 1.72, y: y + 0.14, w: 9.3, h: 0.55, fontSize: 18, color: COLORS.ink, valign: 'mid' });
        });
      }
      break;
    case 'title':
    case 'section':
      break;
  }
}

function optionLetter(index: number): string {
  return ['А', 'Б', 'В', 'Г'][index] ?? String(index + 1);
}

function formatCheckedAt(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/gu, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character);
}

function fixedCoreXml(course: Course, topicTitle: string, date: string): string {
  const timestamp = `${date}T00:00:00Z`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(topicTitle)}</dc:title><dc:subject>${xmlEscape(course.title)}</dc:subject><dc:creator>${xmlEscape(`Курс «${course.title}»`)}</dc:creator><cp:lastModifiedBy>${xmlEscape(`Курс «${course.title}»`)}</cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`;
}

function withFixedMetadata(buffer: Buffer, course: Course, topicTitle: string, date: string): Buffer {
  const entries = readZip(buffer).map((entry): ZipEntry => entry.path === 'docProps/core.xml' ? { ...entry, data: Buffer.from(fixedCoreXml(course, topicTitle, date), 'utf8') } : entry);
  return createZip(entries);
}

function withNativeBulletColors(buffer: Buffer): Buffer {
  const entries = readZip(buffer).map((entry): ZipEntry => {
    if (!/^ppt\/slides\/slide\d+\.xml$/u.test(entry.path)) return entry;
    const xml = Buffer.from(entry.data).toString('utf8').replace(/<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/gu, (paragraph) => {
      if (!/<a:bu(?:Char|AutoNum)\b/u.test(paragraph) || /<a:buClr\b/u.test(paragraph)) return paragraph;
      return paragraph.replace(/(?=<a:bu(?:SzPct|SzPts|Font|FontTx|Char|AutoNum|None)\b)/u, '<a:buClr><a:srgbClr val="004F8F"/></a:buClr>');
    });
    return { ...entry, data: Buffer.from(xml, 'utf8') };
  });
  return createZip(entries);
}

function sourceNotes(notes: string | undefined, slideSources: readonly Source[]): string | undefined {
  if (slideSources.length === 0) return notes;
  const fullSources = slideSources.map((source) => {
    const details = [source.authors.join(', '), source.publisher, source.year === undefined ? undefined : String(source.year), source.url].filter(Boolean).join('; ');
    return `• ${source.title}${details ? ` — ${details}` : ''}`;
  }).join('\n');
  const paragraph = `Джерела\n${fullSources}`;
  return notes ? `${notes}\n\n${paragraph}` : paragraph;
}

export async function buildPresentation(file: SlidesFile, course: Course, sources: SourcesFile | readonly Source[], options: BuildOptions = {}): Promise<Buffer> {
  const topic = course.topics.find((candidate) => candidate.id === file.topic);
  if (!topic) throw new Error(`Тема «${file.topic}» відсутня в course.yaml`);
  const module = course.modules.find((candidate) => candidate.id === topic.module);
  if (!module) throw new Error(`Модуль «${topic.module}» теми «${file.topic}» відсутній у course.yaml`);
  const topicNumber = course.topics.findIndex((candidate) => candidate.id === topic.id) + 1;
  const moduleNumber = course.modules.findIndex((candidate) => candidate.id === module.id) + 1;
  const knownSources = sourceItems(sources);
  const sourceMap = new Map(knownSources.map((source) => [source.id, source]));
  const sections = sectionsOf(file.slides);
  const date = safeDate(options.date ?? DEFAULT_DATE);
  const rootDir = options.rootDir ?? process.cwd();
  const topicDir = options.topicDir ?? join(rootDir, 'content', 'modules', topic.module, topic.id);
  const logoPath = options.logoPath ?? join(rootDir, 'design', 'assets', 'logo-cpnu-uk.png');
  const logoWhitePath = options.logoWhitePath ?? join(rootDir, 'design', 'assets', 'logo-cpnu-uk-white.png');
  await readFile(logoPath);
  await readFile(logoWhitePath);
  const figures = new Map<string, { svg: string; png: Buffer }>();
  for (const item of file.slides) {
    for (const sourceId of item.sources) if (!sourceMap.has(sourceId)) throw new Error(`Слайд «${item.id}»: джерела «${sourceId}» немає в sources.yaml`);
    if (item.type === 'figure') {
      const figureFile = join(topicDir, item.figure);
      const svg = await readFile(figureFile, 'utf8');
      figures.set(item.figure, { svg, png: await rasterizeSvg(svg, options.figureRenderer) });
    }
  }

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'CPNU_WIDE', width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
  pptx.layout = 'CPNU_WIDE';
  pptx.author = `Курс «${course.title}»`;
  pptx.company = course.institution;
  pptx.subject = course.title;
  pptx.title = topic.title;
  pptx.revision = '1';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pptx.rtlMode = false;

  file.slides.forEach((slideData, index) => {
    const slide = pptx.addSlide();
    const sourceList = slideData.sources.map((id) => sourceMap.get(id)).filter((source): source is Source => source !== undefined);
    if (slideData.type === 'title') {
      addTitleSlide(slide, slideData, course, topic, moduleNumber, module.title, logoWhitePath);
    } else if (slideData.type === 'section') {
      addSectionSlide(slide, slideData);
    } else {
      slide.background = { color: COLORS.background };
      const heading = slideHeading(slideData, topic.title);
      const kicker = slideKicker(slideData, sections[index], topicNumber);
      const bodyY = addHeader(slide, slideData, heading, kicker);
      const figure = slideData.type === 'figure' ? figures.get(slideData.figure) : undefined;
      const registeredCase = slideData.type === 'case' ? caseName(course, slideData.case) : undefined;
      addContent(slide, slideData, course, topic, bodyY, figure?.png, figure?.svg, registeredCase);
      addSources(slide, sourceList);
      addFooter(slide, course, topic, index + 1, logoPath);
    }
    const notes = sourceNotes(slideData.notes, sourceList);
    if (notes) slide.addNotes(text(notes));
  });

  const output = await pptx.write({ outputType: 'nodebuffer', compression: true });
  const buffer = Buffer.from(output as Uint8Array);
  return withNativeBulletColors(withFixedMetadata(buffer, course, topic.title, date));
}
