import { markdownToHtml, mdxToJs } from 'satteri';
import { describe, expect, it } from 'vitest';
import { NBSP } from './normalize.ts';
import { typographyPlugin } from './satteri-plugin.ts';

const render = (markdown: string) =>
  markdownToHtml(markdown, { hastPlugins: [typographyPlugin], features: { smartPunctuation: false } }).html;

describe('typographyPlugin (Sätteri hast)', () => {
  it('normalizes prose: quotes, apostrophe, dash and non-breaking spaces', () => {
    const html = render('Закон "Про АТ" № 2465-IX - ст. 3: об\'єкт у статуті.');
    expect(html).toContain(`Закон «Про АТ» №${NBSP}2465-IX${NBSP}— ст.${NBSP}3: об’єкт у${NBSP}статуті.`);
  });

  it('leaves inline code, fenced code and link hrefs untouched', () => {
    const html = render('Ключ `ku:v1:theme` і "код" `a - b`\n\n```\nx - "y"\n```\n\n[з сайту](https://zakon.rada.gov.ua/laws/show/2465-20 "Закон")');
    expect(html).toContain('<code>ku:v1:theme</code>');
    expect(html).toContain('<code>a - b</code>');
    expect(html).toContain('<pre><code>x - "y"\n</code></pre>');
    expect(html).toContain('href="https://zakon.rada.gov.ua/laws/show/2465-20"');
    expect(html).toContain('«код»');
    expect(html).toContain(`і${NBSP}«код»`);
  });

  it('keeps dates, act codes and identifiers intact while converting real ranges', () => {
    const html = render('Перевірено 2026-09-15 за Законом № 2465-IX (z1307-23): у 2020-2026 рр., п. 2-1.');
    expect(html).toContain('2026-09-15');
    expect(html).toContain('2465-IX (z1307-23)');
    expect(html).toContain('2020–2026');
    expect(html).toContain('п.\u00A02-1');
  });

  it('keeps the official spaced hyphen inside a quoted act title, but fixes a spaced hyphen in plain prose', () => {
    const html = render('За Законом «Про державну реєстрацію юридичних осіб, фізичних осіб - підприємців та громадських формувань» рада - орган.');
    expect(html).toContain('фізичних осіб - підприємців');
    expect(html).toContain(`рада${NBSP}— орган`);
  });

  it('keeps headings free of non-breaking spaces so anchors stay clean', () => {
    const html = render('## Ст. 3 і "кворум" у законі');
    expect(html).toContain('>Ст. 3 і «кворум» у законі</h2>');
    expect(html).not.toContain(NBSP);
  });

  it('skips MDX components marked data-typography="off" and Formula, but normalizes other component children', () => {
    const source = [
      '<Formula>S·k / (N + 1) + 1 - "акція"</Formula>',
      '',
      '<Callout data-typography="off">a - "b"</Callout>',
      '',
      '<Term id="corp">корпорації "Зоря"</Term> у 2023 р.',
    ].join('\n');
    const { code } = mdxToJs(source, { hastPlugins: [typographyPlugin], features: { smartPunctuation: false } });
    expect(code).toContain('S·k / (N + 1) + 1 - \\"акція\\"');
    expect(code).toContain('a - \\"b\\"');
    expect(code).toContain('корпорації «Зоря»');
    // У згенерованому JS нерозривний пробіл серіалізується як \xA0
    expect(code).toContain('у\\xA02023\\xA0р.');
  });
});
