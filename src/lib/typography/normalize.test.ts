import { describe, expect, it } from 'vitest';
import { NBSP, normalizeTypography, splitProtected } from './normalize.ts';

describe('normalizeTypography: апостроф', () => {
  it('replaces straight, modifier and backtick apostrophes between Cyrillic letters with ’', () => {
    expect(normalizeTypography("п'ять об'єктів")).toBe('п’ять об’єктів');
    expect(normalizeTypography('імʼя, зв`язок, В´ячеслав, ОБ‘ЄКТ')).toBe('ім’я, зв’язок, В’ячеслав, ОБ’ЄКТ');
  });

  it('leaves Latin contractions and code-like tokens alone', () => {
    expect(normalizeTypography("don't touch O'Neil")).toBe("don't touch O'Neil");
    expect(normalizeTypography("'a'")).toBe("'a'");
  });
});

describe('normalizeTypography: лапки', () => {
  it('turns straight double quotes into «» and nested quotes into „“', () => {
    expect(normalizeTypography('Закон "Про акціонерні товариства"')).toBe('Закон «Про акціонерні товариства»');
    expect(normalizeTypography('ПрАТ "Завод "Зоря" плюс"')).toBe('ПрАТ «Завод „Зоря“ плюс»');
  });

  it('converts English curly quotes and keeps already-correct Ukrainian quotes', () => {
    expect(normalizeTypography('“дотримуйся або пояснюй”')).toBe('«дотримуйся або пояснюй»');
    expect(normalizeTypography('«вже добре»')).toBe('«вже добре»');
    expect(normalizeTypography('„лапки“ теж')).toBe('„лапки“ теж');
  });

  it('opens a quote after an opening bracket or dash and closes before punctuation', () => {
    expect(normalizeTypography('(термін "кворум"), "так".')).toBe('(термін «кворум»), «так».');
  });
});

describe('normalizeTypography: нерозривні пробіли', () => {
  it('binds № and article abbreviations to the following number', () => {
    expect(normalizeTypography('Закон № 2465-IX, ст. 3, п. 2 ч. 1')).toBe(
      `Закон №${NBSP}2465-IX, ст.${NBSP}3, п.${NBSP}2 ч.${NBSP}1`,
    );
  });

  it('binds one-letter prepositions and conjunctions to the next word, including at sentence start', () => {
    expect(normalizeTypography('У товаристві є рада і збори, а в статуті — з правилами.')).toBe(
      `У${NBSP}товаристві є рада і${NBSP}збори, а${NBSP}в${NBSP}статуті${NBSP}— з${NBSP}правилами.`,
    );
  });

  it('binds numbers to units, percent and thousands groups', () => {
    expect(normalizeTypography('48,7 % голосів, 120 год, 2023 р., 1 200 XP')).toBe(
      `48,7${NBSP}% голосів, 120${NBSP}год, 2023${NBSP}р., 1${NBSP}200${NBSP}XP`,
    );
  });

  it('does not double an existing non-breaking space', () => {
    const already = `№${NBSP}5 у${NBSP}статуті`;
    expect(normalizeTypography(already)).toBe(already);
  });
});

describe('normalizeTypography: тире й крапки', () => {
  it('turns spaced hyphens and en dashes into an em dash with a non-breaking space before it', () => {
    expect(normalizeTypography('рада - орган нагляду')).toBe(`рада${NBSP}— орган нагляду`);
    expect(normalizeTypography('рада – орган, рада — орган')).toBe(`рада${NBSP}— орган, рада${NBSP}— орган`);
    expect(normalizeTypography('А -- Б')).toBe(`А${NBSP}— Б`);
  });

  it('keeps hyphens inside words and uses an en dash for numeric ranges', () => {
  expect(normalizeTypography('корпоративно-правовий, 2023-2024, с. 305-360')).toBe(
      `корпоративно-правовий, 2023–2024, с.${NBSP}305–360`,
    );
  });

  it('keeps hyphens in ISO dates, ISBN, phone-like codes, act codes, item numbers and paths', () => {
    const cases = [
      'перевірено 2026-09-15',
      'ISBN 978-617-7360-05-2',
      'тел. 050-123-45-67',
      'Закон № 2465-IX, наказ z1307-23, постанова 448/96-ВР',
      'див. п. 2-1 і ст. 5-2, ч. 3-1, абз. 2-3',
      'файл content/modules/m1-2/lecture-2024-01.mdx і id law-2465-ix',
      'варіант 1-й, 2-га група, 10-ти',
    ];
    for (const text of cases) expect(normalizeTypography(text, { nbsp: false })).toBe(text);
  });

  it('still turns real numeric ranges into en dashes', () => {
    expect(normalizeTypography('у 2020-2026 рр. зросли на 10-25%', { nbsp: false })).toBe('у 2020–2026 рр. зросли на 10–25%');
    expect(normalizeTypography('с. 305-360; 1,5-2 млн', { nbsp: false })).toBe('с. 305–360; 1,5–2 млн');
  });

  it('replaces three dots with an ellipsis', () => {
    expect(normalizeTypography('і так далі...')).toBe(`і${NBSP}так далі…`);
  });
});

describe('normalizeTypography: що не чіпаємо', () => {
  it('leaves URLs and e-mails untouched even when they contain quotes-like characters', () => {
    const text = 'див. https://zakon.rada.gov.ua/laws/show/2465-20#n5 і www.oecd.org/x-y а "лист" на info@example.com';
    expect(normalizeTypography(text)).toBe(
      `див. https://zakon.rada.gov.ua/laws/show/2465-20#n5 і${NBSP}www.oecd.org/x-y а${NBSP}«лист» на info@example.com`,
    );
  });

  it('is idempotent', () => {
    const once = normalizeTypography('Закон "Про АТ" № 2465-IX - ст. 3 у 2023 р...');
    expect(normalizeTypography(once)).toBe(once);
  });

  it('can skip non-breaking spaces (for headings that become anchors)', () => {
    expect(normalizeTypography('Ст. 3 і "кворум"', { nbsp: false })).toBe('Ст. 3 і «кворум»');
  });
});

describe('splitProtected', () => {
  it('separates protected tokens from prose and keeps order', () => {
    expect(splitProtected('a https://x.y/z b')).toEqual([
      { text: 'a ', protected: false },
      { text: 'https://x.y/z', protected: true },
      { text: ' b', protected: false },
    ]);
  });
});
