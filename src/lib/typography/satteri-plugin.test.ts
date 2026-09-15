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
