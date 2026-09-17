import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { beforeAll, describe, expect, test } from 'vitest';
import type { Course } from '../../src/content/schemas/course.ts';
import { PracticalFileSchema, type PracticalFile } from '../../src/content/schemas/practical.ts';
import { typo } from '../../src/lib/typography/index.ts';
import { escapeHtmlText } from './html-tree.ts';
import { extractHead, practicalTitle, renderPracticalPage, reuseHead } from './practical-page.ts';
import { loadCourse } from './test-support/docx-xml.ts';

/** Сторінка умов практичної для PDF: зміст з реєстру й тренажера, без відповідей, у стилях сайту. */

const HEAD = '<meta charset="utf-8"><title>Тема 1 — Курс</title><script>localStorage.getItem("x")</script><link rel="stylesheet" href="/kurs/_astro/topic.css">';

let course: Course;
let file: PracticalFile;

beforeAll(async () => {
  course = await loadCourse();
  file = PracticalFileSchema.parse(parse(await readFile(new URL('../../content/practicals/p01.yaml', import.meta.url), 'utf8')));
});

function practical(): Course['practicals'][number] {
  const found = course.practicals.find((candidate) => candidate.id === file.id);
  if (!found) throw new Error('p01 немає в реєстрі');
  return found;
}

describe('сторінка практичної', () => {
  test('містить мету, завдання, вихідні дані, есе, рубрику з балами й джерела', () => {
    const html = renderPracticalPage({ course, practical: practical(), file, head: HEAD });
    expect(html).toContain(`<title>Практична робота 1. ${practical().title} — ${course.title}</title>`);
    expect(html).toContain('<link rel="stylesheet" href="/kurs/_astro/topic.css">');
    expect(html).not.toContain('<script');
    const shown = (text: string): string => escapeHtmlText(typo(text));
    for (const task of practical().tasks) expect(html).toContain(shown(task));
    for (const criterion of practical().rubric) expect(html).toContain(shown(criterion.title));
    for (const company of file.trainer.companyTasks) expect(html).toContain(shown(company.description));
    expect(html).toContain(shown(file.trainer.essay.prompt));
    expect(html).toContain('Максимум</th><th class="points">3</th>');
    expect(html).toContain('0,5');
    for (const data of practical().data) expect(html).toContain(`href="${data.url}"`);
  });

  test('відповіді й пояснення тренажера в умови не потрапляють', () => {
    const html = renderPracticalPage({ course, practical: practical(), file, head: HEAD });
    const shown = (text: string): string => escapeHtmlText(typo(text));
    for (const company of file.trainer.companyTasks) expect(html).not.toContain(shown(company.explanation));
    for (const hint of file.trainer.essay.hints) expect(html).not.toContain(shown(hint));
  });

  test('текст екранується', () => {
    const risky: PracticalFile = { ...file, intro: 'Порівняйте <b>A</b> & B' };
    const html = renderPracticalPage({ course, practical: practical(), file: risky, head: HEAD });
    expect(html).toContain('Порівняйте &lt;b&gt;A&lt;/b&gt; &amp; B');
  });

  test('заголовок і <head> сторінки сайту', () => {
    expect(practicalTitle(course, practical())).toBe(`Практична робота 1. ${practical().title}`);
    expect(extractHead('<html><head><title>x</title></head><body></body></html>')).toBe('<title>x</title>');
    expect(() => extractHead('<html><body></body></html>')).toThrow('немає <head>');
    expect(reuseHead(HEAD, 'Нова <назва>')).toBe('<meta charset="utf-8"><title>Нова &lt;назва&gt;</title><link rel="stylesheet" href="/kurs/_astro/topic.css">');
  });
});
