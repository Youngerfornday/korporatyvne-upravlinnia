/**
 * Допуск числової відповіді — порт `qtype_numerical_answer::get_tolerance_interval` (Moodle 5.2).
 * `numerical` завжди має номінальний допуск; `calculated` — відносний, номінальний або геометричний.
 */
export type ToleranceType = 'relative' | 'nominal' | 'geometric';

/** pow(10, -precision) при типовому ini `precision = 14` у PHP. */
const PHP_EPSILON = 1e-14;

export function toleranceInterval(answer: number, tolerance: number, type: ToleranceType): readonly [number, number] {
  const widened = Math.abs(tolerance) + PHP_EPSILON;
  switch (type) {
    case 'relative': {
      const range = Math.abs(answer) * widened;
      return [answer - range, answer + range];
    }
    case 'nominal': {
      const range = tolerance + PHP_EPSILON * Math.max(Math.abs(tolerance), Math.abs(answer), PHP_EPSILON);
      return [answer - range, answer + range];
    }
    default: {
      const quotient = 1 + Math.abs(widened);
      return answer < 0 ? [answer * quotient, answer / quotient] : [answer / quotient, answer * quotient];
    }
  }
}

export function withinTolerance(value: number, answer: number, tolerance: number, type: ToleranceType): boolean {
  const [min, max] = toleranceInterval(answer, tolerance, type);
  return min <= value && value <= max;
}
