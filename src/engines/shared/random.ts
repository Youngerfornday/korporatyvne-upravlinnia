/**
 * Детермінована випадковість для рушіїв. Уся «випадковість» (перемішування, варіанти задач,
 * значення наборів даних) проходить лише через переданий RandomSource, тож результат
 * відтворюється за зерном — у тестах, у спробі тесту й у SCORM-пакеті.
 */
export interface RandomSource {
  /** Наступне число з півінтервалу [0, 1). */
  next(): number;
}

const UINT32 = 0x1_0000_0000;

/** Хеш рядка в 32-бітне зерно (cyrb-подібне змішування). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    h = Math.imul(h ^ seed.charCodeAt(index), 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Генератор mulberry32: швидкий, 32-бітний стан, достатній для навчальних задач (не для криптографії). */
export function createSeededRandom(seed: number | string): RandomSource {
  let state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / UINT32;
    },
  };
}

/** Ціле число з відрізка [min, max]. */
export function randomInt(random: RandomSource, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`Некоректні межі випадкового цілого: ${min}..${max}`);
  }
  return min + Math.floor(random.next() * (max - min + 1));
}

/** Нова перемішана копія масиву (Фішер — Єйтс). Вхідний масив не змінюється. */
export function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random.next() * (index + 1));
    const current = copy[index] as T;
    copy[index] = copy[other] as T;
    copy[other] = current;
  }
  return copy;
}

export function pickOne<T>(items: readonly T[], random: RandomSource): T {
  if (items.length === 0) throw new RangeError('Неможливо вибрати елемент з порожнього масиву');
  return items[randomInt(random, 0, items.length - 1)] as T;
}
