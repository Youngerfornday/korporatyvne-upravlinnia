import { describe, expect, it } from 'vitest';
import type { Slide } from '../../content/schemas/slides';
import { notesParagraphs, optionLetter, sectionsOf, slideHeading, slideKicker, slidesPath, sourceLabel } from './slides-pure';

const title: Slide = { id: 'title', type: 'title', sources: [] };
const section = (id: string, number: number | undefined, text: string): Slide => ({ id, type: 'section', title: text, number, sources: [] });
const bullets = (id: string, text: string): Slide => ({ id, type: 'bullets', title: text, bullets: ['Пункт'], sources: [] });

describe('slidesPath', () => {
  it('builds the presentation route of a topic', () => {
    expect(slidesPath('korporatsiia')).toBe('temy/korporatsiia/prezentatsiia/');
  });
});

describe('sourceLabel', () => {
  it('names up to two authors with the year', () => {
    expect(sourceLabel({ authors: ['Jensen M. C.', 'Meckling W. H.'], title: 'Theory of the Firm', year: 1976 })).toBe('Jensen M. C., Meckling W. H., 1976');
  });

  it('shortens a long author list and falls back to the title', () => {
    expect(sourceLabel({ authors: ['A', 'B', 'C'], title: 'Звіт', year: 2002 })).toBe('A та ін., 2002');
    expect(sourceLabel({ authors: [], title: 'Кодекс корпоративного управління', year: undefined })).toBe('Кодекс корпоративного управління');
  });
});

describe('sectionsOf', () => {
  it('assigns every slide to the latest section before it', () => {
    const slides = [title, section('s1', 1, 'Корпорація'), bullets('b1', 'Ознаки'), section('s2', 2, 'Розрив'), bullets('b2', 'Схема')];
    expect(sectionsOf(slides).map((item) => item?.title)).toEqual([undefined, 'Корпорація', 'Корпорація', 'Розрив', 'Розрив']);
  });
});

describe('slideKicker', () => {
  it('numbers content slides by topic and section', () => {
    expect(slideKicker(bullets('b1', 'Ознаки'), { number: 2, title: 'Розрив' }, 1)).toBe('1.2 · Розрив');
    expect(slideKicker(bullets('b1', 'Ознаки'), { number: undefined, title: 'Вступ' }, 1)).toBe('Вступ');
    expect(slideKicker(bullets('b1', 'Ознаки'), undefined, 1)).toBeUndefined();
  });

  it('labels slides that stand outside the sections by their role', () => {
    const inSection = { number: 7, title: 'Вартість' };
    expect(slideKicker({ id: 'c', type: 'case', title: 'Кейс', case: 'enron', facts: ['Факт'], question: 'Чому?', sources: [] }, inSection, 1)).toBe('Кейс для аналізу');
    expect(slideKicker({ id: 'q', type: 'question', prompt: 'Чому?', options: [], sources: [] }, inSection, 1)).toBe('Питання до аудиторії');
    expect(slideKicker({ id: 's', type: 'summary', title: 'Підсумок', bullets: ['Пункт'], sources: [] }, inSection, 1)).toBe('Підсумок');
    expect(slideKicker({ id: 'o', type: 'outcomes', title: 'Результати', sources: [] }, undefined, 1)).toBe('Результати навчання');
  });
});

describe('slideHeading', () => {
  it('gives every slide an accessible title', () => {
    expect(slideHeading(title, 'Корпорація')).toBe('Корпорація');
    expect(slideHeading(bullets('b', 'Ознаки'), 'Корпорація')).toBe('Ознаки');
    expect(slideHeading({ id: 'q', type: 'question', prompt: 'Чому?', options: [], sources: [] }, 'Т')).toBe('Питання до аудиторії');
    expect(slideHeading({ id: 'x', type: 'quote', text: 'Цитата', attribution: 'Фрідман', sources: [] }, 'Т')).toBe('Цитата: Фрідман');
  });
});

describe('notesParagraphs', () => {
  it('starts a new paragraph at the example, the question and the caveat', () => {
    expect(notesParagraphs('Пояснення: суть. Приклад: кав’ярня. Питання до аудиторії: чому? Відповідь: так.')).toEqual([
      'Пояснення: суть.',
      'Приклад: кав’ярня.',
      'Питання до аудиторії: чому? Відповідь: так.',
    ]);
    expect(notesParagraphs('Суть. Обережно з висновками: позиція НБУ. Застереження: лише біржові.')).toEqual([
      'Суть.',
      'Обережно з висновками: позиція НБУ.',
      'Застереження: лише біржові.',
    ]);
    expect(notesParagraphs('Один абзац без маркерів.')).toEqual(['Один абзац без маркерів.']);
  });
});

describe('optionLetter', () => {
  it('uses Ukrainian letters for audience options', () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(['А', 'Б', 'В', 'Г']);
  });
});
