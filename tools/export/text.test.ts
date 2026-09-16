import { describe, expect, it } from 'vitest';
import { MOODLE_GRADE_PERCENTS } from '../../src/content/schemas/questions.ts';
import { NBSP } from '../../src/lib/typography/normalize.ts';
import { formatFraction, formatNumber, htmlText, inlineHtml, questionName, toHtmlParagraphs, typoPlain } from './text.ts';

describe('formatNumber', () => {
  it.each([
    [1.5, '1.5'],
    [32.5, '32.5'],
    [-0, '0'],
    [0, '0'],
    [100, '100'],
    [1e-7, '0.0000001'],
    [-2.5e-8, '-0.000000025'],
    [1e21, '1000000000000000000000'],
    [0.1 + 0.2, '0.30000000000000004'],
  ])('%s → %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
    expect(Number(formatNumber(value))).toBe(value === 0 ? 0 : value);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('%s — помилка', (value) => {
    expect(() => formatNumber(value)).toThrow(/скінченним/);
  });
});

describe('formatFraction', () => {
  it('кожна оцінка Moodle і її штраф повертаються канонічно', () => {
    for (const grade of MOODLE_GRADE_PERCENTS) {
      expect(formatFraction(grade)).toBe(formatNumber(grade));
      expect(formatFraction(-grade)).toBe(formatNumber(grade === 0 ? 0 : -grade));
    }
  });

  it('близьке значення з допуском схеми стає канонічним', () => {
    expect(formatFraction(33.333)).toBe('33.33333');
    expect(formatFraction(-16.667)).toBe('-16.66667');
    expect(formatFraction(12.5004)).toBe('12.5');
  });

  it('значення поза списком — помилка', () => {
    expect(() => formatFraction(35)).toThrow(/не входить до списку Moodle/);
  });
});

describe('questionName', () => {
  it('коротке питання — повністю, без нерозривних пробілів', () => {
    expect(questionName('Хто скликає збори у товаристві?')).toBe('Хто скликає збори у товаристві?');
    expect(questionName('Хто скликає збори у товаристві?')).not.toContain(NBSP);
  });

  it('довге — перші 10 слів і три крапки без розділового знака перед ними', () => {
    expect(questionName('Один два три чотири п’ять шість сім вісім дев’ять десять, одинадцять дванадцять')).toBe(
      'Один два три чотири п’ять шість сім вісім дев’ять десять…',
    );
  });

  it('обрізає за довжиною по межі слова, а надто довге слово — жорстко', () => {
    const long = `${'Корпоративне '.repeat(8)}управління`;
    const name = questionName(long);
    expect(name.length).toBeLessThanOrEqual(81);
    expect(name.endsWith('Корпоративне…')).toBe(true);
    expect(questionName('А'.repeat(120))).toBe(`${'А'.repeat(80)}…`);
  });

  it('мітки пропусків замінюються трьома крапками, < і > кодуються', () => {
    expect(questionName('Кворум [[1]] при {#2} < 50%')).toBe('Кворум … при … &lt; 50%');
  });
});

describe('HTML тексту', () => {
  it('абзаци, переноси й екранування', () => {
    expect(toHtmlParagraphs('  перший\nрядок \n \n\n другий  ')).toBe('<p>перший<br>рядок</p><p>другий</p>');
    expect(htmlText('A & "B" <c>')).toBe('<p>A &amp; «B» &lt;c&gt;</p>');
    expect(inlineHtml('рядок\n  другий')).toBe('рядок другий');
  });

  it('typoPlain ставить апостроф і лапки, але не нерозривні пробіли', () => {
    expect(typoPlain(' об\'єкт у "лапках" ')).toBe('об’єкт у «лапках»');
  });
});
