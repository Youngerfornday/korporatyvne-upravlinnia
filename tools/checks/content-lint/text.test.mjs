import { describe, expect, it } from 'vitest';
import { hasAllStems, hasAnyStem, quote, quoteAround, signatureStems, splitClauses, splitSentences, stem } from './text.mjs';

describe('splitSentences', () => {
  it('does not split after legal abbreviations, dates and initials', () => {
    const text = 'Кворум — ст. 40 ч. 1 Закону. У 1932 р. вийшла книга. Рішення № 118 від 12.03.2020 чинне.';
    expect(splitSentences(text)).toEqual([
      'Кворум — ст. 40 ч. 1 Закону.',
      'У 1932 р. вийшла книга.',
      'Рішення № 118 від 12.03.2020 чинне.',
    ]);
  });

  it('returns a single sentence when there is no terminator', () => {
    expect(splitSentences('  Текст без крапки  ')).toEqual(['Текст без крапки']);
  });
});

describe('splitClauses', () => {
  it('splits a sentence on semicolons and dashes', () => {
    expect(splitClauses('Принцип 1.4 вимагає розкриття; випадок Toyota показує інше — комітет ухвалив рішення')).toEqual([
      'Принцип 1.4 вимагає розкриття',
      'випадок Toyota показує інше',
      'комітет ухвалив рішення',
    ]);
  });
});

describe('signatureStems', () => {
  it('keeps abbreviations, years and long words, drops short words', () => {
    expect(signatureStems('Редакція Принципів ОЕСР 2004 р.')).toEqual(['редакц', 'принци', 'оеср', '2004']);
  });

  it('matches word forms through stems', () => {
    expect(hasAllStems('частку незалежних директорів у раді ПАТ', signatureStems('Незалежні директори ПАТ'))).toBe(true);
    expect(hasAllStems('частку незалежних директорів у раді', signatureStems('Незалежні директори ПАТ'))).toBe(false);
    expect(hasAnyStem('рада директорів', ['директ'])).toBe(true);
    expect(stem('директорів')).toBe('директ');
  });

  it('is empty for a phrase without significant words', () => {
    expect(signatureStems('і в на з')).toEqual([]);
    expect(hasAllStems('будь-що', [])).toBe(false);
  });
});

describe('quote', () => {
  it('shortens long text and centres the quote on the needle', () => {
    const long = `${'а'.repeat(200)} № 590-IX ${'б'.repeat(200)}`;
    expect(quote(long)).toHaveLength(160);
    expect(quoteAround(long, '№ 590-IX')).toContain('№ 590-IX');
    expect(quoteAround('коротко', 'коротко')).toBe('коротко');
  });
});
