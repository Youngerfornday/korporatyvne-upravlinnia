import { describe, expect, it } from 'vitest';
import { checkSvgSafety } from './svg-safety.mjs';

const file = (text) => ({
  file: 'content/modules/m1/t01/fig-test.svg',
  text,
  lines: text.split('\n'),
});

describe('checkSvgSafety', () => {
  it.each([
    ['<script>alert(1)</script>', '<script'],
    ['<foreignObject></foreignObject>', '<foreignObject'],
    ['<svg onclick="alert(1)"></svg>', 'on*'],
    ['<a href="https://evil.example/x">x</a>', 'http'],
    ['<a xlink:href="javascript:alert(1)">x</a>', 'javascript'],
    ['<iframe src="https://evil.example"></iframe>', '<iframe'],
    ['<object data="x"></object>', '<object'],
    ['<embed src="x">', '<embed'],
  ])('помиляється на %s', (svg, marker) => {
    const findings = checkSvgSafety([file(`<svg viewBox="0 0 1 1">${svg}</svg>`) ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain(marker);
  });

  it('приймає чисту схему', () => {
    expect(checkSvgSafety([file('<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" /></svg>')])).toEqual([]);
  });
});
