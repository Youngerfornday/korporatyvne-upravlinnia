import { describe, expect, it } from 'vitest';
import { articleNumbers, expectedDates, parseBaseline } from './baseline.mjs';
import { BASELINE_MARKDOWN, baseline } from './__fixtures__/baseline.mjs';

describe('parseBaseline', () => {
  const parsed = baseline();

  it('reads the base check date and the codes with their articles', () => {
    expect(parsed.baseDate).toBe('2026-09-14');
    expect([...parsed.codes.keys()]).toEqual(['AT-26', 'AT-01', 'MS-01', 'UBO-03']);
    expect([...parsed.codes.get('AT-01').articles]).toEqual(['6', '2']);
    expect([...parsed.codes.get('MS-01').articles]).toEqual([]);
  });

  it('takes the date from the key-numbers table, then from the section, then from the document', () => {
    expect([...expectedDates(parsed, 'AT-26')]).toEqual(['2026-09-15']);
    expect([...expectedDates(parsed, 'UBO-03')]).toEqual(['2026-09-16']);
    expect([...expectedDates(parsed, 'MS-01')]).toEqual(['2026-09-14']);
    expect([...expectedDates(parsed, 'ZZ-99')]).toEqual(['2026-09-14']);
  });

  it('prefers a date written in the row itself over the section date', () => {
    const withRowDate = parseBaseline(BASELINE_MARKDOWN.replace(
      '| [UBO-03] Актуалізація відомостей | Закон № 361-IX ст. 5-1 ч. 1 | 30 робочих днів на оновлення. | Т1 |',
      '| [UBO-03] Актуалізація відомостей | Закон № 361-IX ст. 5-1 ч. 1 | 30 робочих днів (перевірено 2026-09-17). | Т1 |',
    ));
    expect([...expectedDates(withRowDate, 'UBO-03')]).toEqual(['2026-09-17']);
  });

  it('works for a document without a base date', () => {
    const bare = parseBaseline('## 1. Розділ\n\n| [AT-01] Типи | ст. 6 | Переказ | Т1 |');
    expect(bare.baseDate).toBe('');
    expect([...expectedDates(bare, 'AT-01')]).toEqual(['']);
  });

  it('collects law numbers and marks the ones confirmed outside the unconfirmed section', () => {
    expect(parsed.laws.get('2465-IX')).toEqual({ confirmed: true, line: expect.any(Number) });
    expect(parsed.laws.get('361-IX').confirmed).toBe(true);
    expect(parsed.laws.has('590-IX')).toBe(false);
  });

  it('reads the unconfirmed items with their signatures', () => {
    expect(parsed.unconfirmed).toHaveLength(2);
    expect(parsed.unconfirmed[0].title).toBe('Незалежні директори в раді директорів ПАТ');
    expect(parsed.unconfirmed[0].stems).toContain('незале');
    expect(parsed.unconfirmed[1].stems).toContain('2004');
  });

  it('marks a law mentioned only in the unconfirmed section as unconfirmed', () => {
    const withOnlyUnconfirmed = parseBaseline(BASELINE_MARKDOWN.replace('- Закон № 361-IX — https://example.org/361', ''));
    expect(withOnlyUnconfirmed.laws.get('361-IX').confirmed).toBe(true);
    const moved = parseBaseline(BASELINE_MARKDOWN.replace('| [UBO-03] Актуалізація відомостей | Закон № 361-IX ст. 5-1 ч. 1 | 30 робочих днів на оновлення. | Т1 |', '').replace('- Закон № 361-IX — https://example.org/361', '') + '\n\n## Не підтверджено / потребує звірки викладачем\n\n1. **Щорічне підтвердження КБВ.** У Законі № 999-XX такої вимоги немає.');
    expect(moved.laws.get('999-XX').confirmed).toBe(false);
  });
});

describe('articleNumbers', () => {
  it('reads article numbers, including compound ones', () => {
    expect([...articleNumbers('ст. 107 ч. 1–3, 15 п. 1; ст. 5-1 ч. 4')]).toEqual(['107', '5-1']);
    expect([...articleNumbers('розділи I–VI')]).toEqual([]);
  });
});
