import { readFileSync } from 'node:fs';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CourseSchema, type Course } from '../../../src/content/schemas/course.ts';
import { SlidesFileSchema } from '../../../src/content/schemas/slides.ts';
import { SourcesFileSchema } from '../../../src/content/schemas/sources.ts';
import { readZip, readZipText } from '../unzip.ts';
import { buildPresentation, compactSourceLabel, SOURCE_LINE_CHAR_LIMIT } from './pptx.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = join(ROOT, 'tools/export/slides/__fixtures__');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const renderStub = async (): Promise<Buffer> => PNG;
const course: Course = CourseSchema.parse(parse(readFileSync(join(ROOT, 'content/course.yaml'), 'utf8')));

let tempDir: string;
beforeAll(async () => {
  tempDir = await mkdtemp(join('/private/tmp', 'cpnu-slides-'));
});
afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function emu(value: string): number {
  return Number(value) / 914400;
}

function expectShapesWithinSlide(xml: string): void {
  const transforms = [...xml.matchAll(/<a:xfrm>[\s\S]*?<a:off\s+x="([\d-]+)"\s+y="([\d-]+)"\s*\/>[\s\S]*?<a:ext\s+cx="([\d-]+)"\s+cy="([\d-]+)"\s*\/>[\s\S]*?<\/a:xfrm>/gu)];
  expect(transforms.length).toBeGreaterThan(0);
  for (const match of transforms) {
    const [, x, y, cx, cy] = match;
    expect(emu(x ?? '0')).toBeGreaterThanOrEqual(-0.001);
    expect(emu(y ?? '0')).toBeGreaterThanOrEqual(-0.001);
    expect(emu(x ?? '0') + emu(cx ?? '0')).toBeLessThanOrEqual(13.334);
    expect(emu(y ?? '0') + emu(cy ?? '0')).toBeLessThanOrEqual(7.501);
  }
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/gu, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character);
}

function expectNativeListParagraphs(xml: string, items: readonly string[]): void {
  const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/gu)].map((match) => match[1] ?? '');
  for (const item of items) {
    const expected = xmlEscape(item);
    const matches = paragraphs.filter((paragraph) => paragraph.includes(item) || paragraph.replace(/\u00a0/gu, ' ').includes(item) || paragraph.includes(expected));
    expect(matches, `Пункт «${item}» має бути в одному абзаці`).toHaveLength(1);
    expect(matches[0]).toMatch(/<a:bu(?:Char|AutoNum)\b/u);
    expect(matches[0]).toMatch(/<a:buClr><a:srgbClr val="004F8F"\/><\/a:buClr>/u);
    expect(matches[0]?.match(/<a:t>/gu)).toHaveLength(1);
  }
}

describe('buildPresentation', () => {
  test('збирає фікстуру з усіма 12 типами слайдів', async () => {
    const file = SlidesFileSchema.parse(parse(await readFile(join(FIXTURES, 'slides.yaml'), 'utf8')));
    const sources = SourcesFileSchema.parse(parse(await readFile(join(FIXTURES, 'sources.yaml'), 'utf8')));
    const deck = await buildPresentation(file, course, sources, { rootDir: ROOT, topicDir: FIXTURES, date: '2026-09-17', figureRenderer: renderStub });
    const entries = readZip(deck);
    expect(entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry.path))).toHaveLength(12);
    const slide1 = readZipText(deck, 'ppt/slides/slide1.xml');
    const slide4 = readZipText(deck, 'ppt/slides/slide4.xml');
    expect(slide1).toContain('Фікстурна тема');
    expect(slide4).toContain('Перший пункт');
    expect(slide4).toContain('<a:t>4</a:t>');
    expectNativeListParagraphs(slide4, ['Перший пункт', 'Другий пункт']);
    expect(readZipText(deck, 'ppt/slides/slide1.xml')).not.toContain('Джерела');
    expect(readZipText(deck, 'ppt/notesSlides/notesSlide1.xml')).toContain('Нотатки титульного слайда');
    expect(readZipText(deck, 'ppt/notesSlides/notesSlide1.xml')).toContain('Джерела');
    expect(readZipText(deck, 'ppt/notesSlides/notesSlide1.xml')).toContain('Фікстурне джерело');
    expectShapesWithinSlide(slide1);
    expectShapesWithinSlide(slide4);
    const media = entries.filter((entry) => entry.path.startsWith('ppt/media/'));
    expect(media.some((entry) => Buffer.compare(Buffer.from(entry.data), readFileSync(join(ROOT, 'design/assets/logo-cpnu-uk-white.png'))) === 0)).toBe(true);
    expect(media.some((entry) => Buffer.compare(Buffer.from(entry.data), PNG) === 0)).toBe(true);
  });

  test('збирає реальну t01 і зберігає кирилицю, нотатки, логотипи, схеми та межі координат', async () => {
    const file = SlidesFileSchema.parse(parse(await readFile(join(ROOT, 'content/modules/m1/t01/slides.yaml'), 'utf8')));
    const sources = SourcesFileSchema.parse(parse(await readFile(join(ROOT, 'content/modules/m1/t01/sources.yaml'), 'utf8')));
    const deck = await buildPresentation(file, course, sources, { rootDir: ROOT, topicDir: join(ROOT, 'content/modules/m1/t01'), date: '2026-09-17', figureRenderer: renderStub });
    const entries = readZip(deck);
    expect(entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry.path))).toHaveLength(28);
    expect(readZipText(deck, 'ppt/slides/slide1.xml')).toMatch(/Корпорація і[\s\u00a0]корпоративне управління/u);
    expect(readZipText(deck, 'ppt/slides/slide1.xml')).not.toContain('Джерела');
    expect(readZipText(deck, 'ppt/slides/slide3.xml')).not.toContain('Джерела');
    expect(readZipText(deck, 'ppt/slides/slide8.xml')).toContain('Контролюючий власник');
    expect(readZipText(deck, 'ppt/notesSlides/notesSlide1.xml')).toContain('Відкрийте лекцію');
    expect(readZipText(deck, 'ppt/notesSlides/notesSlide1.xml')).toContain('Джерела');
    expect(readZipText(deck, 'ppt/notesSlides/notesSlide1.xml')).toContain('Виступ Голови НБУ');
    expect(readZipText(deck, 'ppt/slides/slide28.xml')).toContain('Підсумок лекції');
    const sourceMap = new Map(sources.sources.map((source) => [source.id, source]));
    file.slides.forEach((slideData, index) => {
      const slideNumber = index + 1;
      const slideXml = readZipText(deck, `ppt/slides/slide${slideNumber}.xml`);
      const sourceList = slideData.sources.map((id) => sourceMap.get(id)).filter((source): source is NonNullable<typeof source> => source !== undefined);
      if (slideData.type === 'title' || slideData.type === 'section') {
        expect(slideXml).not.toContain('Джерела');
      }
      if (slideData.type === 'bullets' || slideData.type === 'summary') expectNativeListParagraphs(slideXml, slideData.bullets);
      if (slideData.type === 'formula') expectNativeListParagraphs(slideXml, slideData.explanation);
      if (slideData.type === 'two-columns') {
        expectNativeListParagraphs(slideXml, [...slideData.left.bullets, ...slideData.right.bullets]);
      }
      if (sourceList.length > 0) {
        const sourceLabel = compactSourceLabel(sourceList);
        expect(sourceLabel.split('\n').length).toBeLessThanOrEqual(2);
        expect(sourceLabel.split('\n').every((line) => line.length <= SOURCE_LINE_CHAR_LIMIT)).toBe(true);
        if (slideData.type !== 'title' && slideData.type !== 'section') {
          expect(slideXml).toContain('Джерела:');
        }
        const notesXml = readZipText(deck, `ppt/notesSlides/notesSlide${slideNumber}.xml`);
        expect(notesXml).toContain('Джерела');
        const normalizedNotesXml = notesXml.replace(/\u00a0/gu, ' ');
        sourceList.forEach((source) => expect(normalizedNotesXml).toContain(xmlEscape(source.title)));
      }
    });
    const media = entries.filter((entry) => entry.path.startsWith('ppt/media/'));
    expect(media.some((entry) => Buffer.compare(Buffer.from(entry.data), readFileSync(join(ROOT, 'design/assets/logo-cpnu-uk.png'))) === 0)).toBe(true);
    expect(media.some((entry) => Buffer.compare(Buffer.from(entry.data), readFileSync(join(ROOT, 'design/assets/logo-cpnu-uk-white.png'))) === 0)).toBe(true);
    expect(media.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index <= 28; index += 1) expectShapesWithinSlide(readZipText(deck, `ppt/slides/slide${index}.xml`));
    const core = readZipText(deck, 'docProps/core.xml');
    expect(core).toContain('<dcterms:created xsi:type="dcterms:W3CDTF">2026-09-17T00:00:00Z</dcterms:created>');
    expect(core).toContain('<dc:creator>Курс «Корпоративне управління»</dc:creator>');
    expect(readZipText(deck, 'docProps/app.xml')).toContain('Національний університет «Чернігівська політехніка»');
  });
});
