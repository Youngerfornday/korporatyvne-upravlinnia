import { err, ok, type Result } from '../shared/result';

/**
 * Бал за критерієм рубрики реєстру (course.yaml → practicals[].rubric) за часткою правильних зіставлень.
 * Числового порогу схема рубрики не має — він записаний в описі рівня («не менше 90%», «60–89%»),
 * тому поріг читається з тексту, а рубрика без порогів або з непослідовними порогами — помилка даних.
 */
export interface RubricLevelInput {
  readonly points: number;
  readonly description: string;
}

export interface RubricBand {
  /** Мінімальний відсоток правильних (включно). Для найнижчого рівня — 0. */
  readonly minPercent: number;
  readonly points: number;
  readonly description: string;
}

export interface RubricParseError {
  readonly code: 'no-threshold' | 'inconsistent';
  readonly message: string;
}

export interface RubricMark {
  readonly band: RubricBand;
  readonly points: number;
  readonly maxPoints: number;
  /** Відсоток правильних 0..100. */
  readonly percent: number;
}

const MAX_PERCENT = 100;
/** Перше число перед знаком відсотка; діапазон «60–89%» дає нижню межу 60. */
const PERCENT_THRESHOLD = /(\d+(?:[.,]\d+)?)\s*(?:[–—-]\s*\d+(?:[.,]\d+)?\s*)?%/u;

function thresholdOf(level: RubricLevelInput): number | null {
  const match = PERCENT_THRESHOLD.exec(level.description);
  return match?.[1] ? Number(match[1].replace(',', '.')) : null;
}

function inconsistent(message: string): { readonly ok: false; readonly error: RubricParseError } {
  return err({ code: 'inconsistent', message });
}

export function rubricBandsFromLevels(levels: readonly RubricLevelInput[]): Result<readonly RubricBand[], RubricParseError> {
  const sorted = [...levels].sort((a, b) => b.points - a.points);
  const lowest = sorted.at(-1);
  if (!lowest || lowest.points !== 0) return inconsistent('Рубрика матриці має містити рівень на 0 балів.');

  const bands: RubricBand[] = [];
  for (const level of sorted) {
    const minPercent = level === lowest ? 0 : thresholdOf(level);
    if (minPercent === null) {
      return err({ code: 'no-threshold', message: `Рівень «${level.description}»: не знайдено порогу у відсотках.` });
    }
    const previous = bands.at(-1);
    if (minPercent > MAX_PERCENT || (previous && minPercent >= previous.minPercent)) {
      return inconsistent(`Рівень «${level.description}»: пороги рівнів мають спадати від ${MAX_PERCENT}% до 0.`);
    }
    bands.push({ minPercent, points: level.points, description: level.description });
  }
  return ok(bands);
}

/** Рівень рубрики за кількістю правильних; межа включна й порівнюється без похибки округлення (9 з 10 = 90%). */
export function rubricMark(bands: readonly RubricBand[], right: number, total: number): RubricMark {
  const top = bands[0];
  if (!top) throw new Error('Рубрика без рівнів');
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(right) || right < 0 || right > total) {
    throw new Error(`Некоректні лічильники рубрики: ${right} з ${total}`);
  }
  const band = bands.find((candidate) => right * MAX_PERCENT >= candidate.minPercent * total) ?? (bands.at(-1) as RubricBand);
  return { band, points: band.points, maxPoints: top.points, percent: (right / total) * MAX_PERCENT };
}
