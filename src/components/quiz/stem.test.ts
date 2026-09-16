import { describe, expect, test } from 'vitest';
import { splitClozeStem, splitGapStem, substituteWildcards } from './stem';

describe('splitGapStem', () => {
  test('пропуски нумеруються за порядком появи, текст між ними зберігається', () => {
    expect(splitGapStem('Кворум — це [[1]] акцій, рішення — [[3]] голосів.')).toEqual([
      { kind: 'text', text: 'Кворум — це ' },
      { kind: 'slot', index: 0 },
      { kind: 'text', text: ' акцій, рішення — ' },
      { kind: 'slot', index: 1 },
      { kind: 'text', text: ' голосів.' },
    ]);
  });

  test('без пропусків — один текстовий фрагмент', () => {
    expect(splitGapStem('Просто текст')).toEqual([{ kind: 'text', text: 'Просто текст' }]);
  });
});

describe('splitClozeStem', () => {
  test('індекс частини береться з номера мітки, а не з порядку появи', () => {
    expect(splitClozeStem('{#2} а потім {#1}')).toEqual([
      { kind: 'slot', index: 1 },
      { kind: 'text', text: ' а потім ' },
      { kind: 'slot', index: 0 },
    ]);
  });
});

describe('substituteWildcards', () => {
  test('підставляє значення у форматі uk-UA, невідомі змінні лишає', () => {
    expect(substituteWildcards('Прибуток {p} тис. грн, частка {r} %, {unknown}', { p: 1234.5, r: 20 })).toBe('Прибуток 1 234,5 тис. грн, частка 20 %, {unknown}');
  });
});
