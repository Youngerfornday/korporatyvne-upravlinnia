import { describe, expect, it } from 'vitest';
import { estimateReadingMinutes, formatDate, minutesLabel } from './course-data-pure';

describe('estimateReadingMinutes', () => {
  it('returns undefined without a body and at least one minute otherwise', () => {
    expect(estimateReadingMinutes(undefined)).toBeUndefined();
    expect(estimateReadingMinutes('Коротко.')).toBe(1);
  });

  it('counts words at 180 per minute and ignores frontmatter', () => {
    const body = `---\nid: t01\n---\n${'слово '.repeat(900)}`;
    expect(estimateReadingMinutes(body)).toBe(5);
  });
});

describe('formatDate and minutesLabel', () => {
  it('formats ISO dates as dd.mm.yyyy in Kyiv time', () => {
    expect(formatDate('2026-09-02')).toBe('02.09.2026');
  });

  it('binds the minutes unit with a non-breaking space', () => {
    expect(minutesLabel(32)).toBe('32 хв');
  });
});
