import { describe, expect, it } from 'vitest';
import { SlidesFileSchema } from './slides';

const deck = (slides: unknown[]) => ({ topic: 't01', slides });

const title = { id: 'title', type: 'title' };
const bullets = { id: 'agency', type: 'bullets', title: 'Агентська проблема', bullets: ['Принципал доручає агентові діяти від свого імені.'] };
const summary = { id: 'summary', type: 'summary', title: 'Підсумок', bullets: ['Корпоративне управління знижує агентські витрати.'] };

describe('SlidesFileSchema', () => {
  it('приймає стислу презентацію з титулом, змістом і підсумком', () => {
    const parsed = SlidesFileSchema.parse(deck([title, bullets, summary]));
    expect(parsed.slides[1]).toMatchObject({ type: 'bullets', sources: [] });
  });

  it('вимагає титульного першого слайда й унікальних ID', () => {
    expect(SlidesFileSchema.safeParse(deck([bullets, title, summary])).success).toBe(false);
    expect(SlidesFileSchema.safeParse(deck([title, bullets, bullets])).success).toBe(false);
  });

  it('обмежує обсяг тексту на слайді', () => {
    const tooMany = { ...bullets, bullets: Array.from({ length: 7 }, (_, i) => `Пункт ${i + 1}`) };
    const tooLong = { ...bullets, bullets: ['а'.repeat(141)] };
    expect(SlidesFileSchema.safeParse(deck([title, tooMany, summary])).success).toBe(false);
    expect(SlidesFileSchema.safeParse(deck([title, tooLong, summary])).success).toBe(false);
  });

  it('приймає схему лише з файлу fig-*.svg', () => {
    const figure = { id: 'fig', type: 'figure', title: 'Розрив власності й контролю', figure: 'fig-01-separation.svg', caption: 'Рисунок 1.' };
    expect(SlidesFileSchema.safeParse(deck([title, figure, summary])).success).toBe(true);
    expect(SlidesFileSchema.safeParse(deck([title, { ...figure, figure: '../secret.png' }, summary])).success).toBe(false);
  });
});
