import { parseMoodleNumber } from '../../shared/decimal-input';
import { createSeededRandom } from '../../shared/random';
import { compileFormula } from '../formula';
import type { GradeResult, LayoutOf, QuestionOf, ResponseOf } from '../types';
import { GAVE_UP, graded, percentToFraction } from './states';
import { withinTolerance, type ToleranceType } from './tolerance';

export interface NumericTarget {
  /** null — формулу не вдалося обчислити; така відповідь ніколи не збігається. */
  readonly value: number | null;
  readonly tolerance: number;
  readonly type: ToleranceType;
}

/** qtype_numerical_question::get_matching_answer: перша відповідь банку, у допуск якої потрапляє значення. */
export function matchNumericAnswer(targets: readonly NumericTarget[], value: number): number | null {
  const index = targets.findIndex((target) => target.value !== null && withinTolerance(value, target.value, target.tolerance, target.type));
  return index === -1 ? null : index;
}

function isBlank(answer: string): boolean {
  return answer.trim() === '';
}

/**
 * Спільне оцінювання numerical і calculated (qtype_numerical_question::grade_response):
 * без одиниць виміру штраф за одиницю нульовий, але apply_unit_penalty повертає max(fraction, 0).
 */
function gradeAgainst(targets: readonly NumericTarget[], fractions: readonly number[], answer: string): GradeResult {
  if (isBlank(answer)) return GAVE_UP;
  const { value } = parseMoodleNumber(answer);
  const index = value === null ? null : matchNumericAnswer(targets, value);
  if (index === null) return graded(0);
  return graded(Math.max(percentToFraction(fractions[index] ?? 0), 0));
}

export function numericalTargets(answers: QuestionOf<'numerical'>['answers']): readonly NumericTarget[] {
  return answers.map((answer) => ({ value: answer.value, tolerance: answer.tolerance, type: 'nominal' }));
}

export function gradeNumerical(question: QuestionOf<'numerical'>, response: ResponseOf<'numerical'>): GradeResult {
  return gradeAgainst(
    numericalTargets(question.answers),
    question.answers.map((answer) => answer.fraction),
    response.answer,
  );
}

/**
 * Набори даних calculated (qtype_calculated::generate_dataset_item): uniform — min + (max − min)·r,
 * loguniform — exp(ln|min| + (ln|max| − ln|min|)·r), округлення до `decimals` як sprintf("%.Nf").
 * Зерно — ID питання, тож набір стабільний між спробами (у Moodle його генерують один раз при створенні
 * питання); спроба лише вибирає номер варіанта. Той самий набір може вивантажити експортер Moodle XML.
 */
export function generateDatasetItems(question: QuestionOf<'calculated'>): readonly Readonly<Record<string, number>>[] {
  const random = createSeededRandom(`calculated:${question.id}`);
  return Array.from({ length: question.itemCount }, () =>
    Object.fromEntries(
      question.datasets.map((dataset) => {
        const r = random.next();
        const raw =
          dataset.distribution === 'loguniform'
            ? Math.exp(Math.log(Math.abs(dataset.min)) + (Math.log(Math.abs(dataset.max)) - Math.log(Math.abs(dataset.min))) * r)
            : dataset.min + (dataset.max - dataset.min) * r;
        return [dataset.name, Number(raw.toFixed(dataset.decimals))];
      }),
    ),
  );
}

/** Значення кожної формули відповіді для значень варіанта (без округлення — його Moodle застосовує лише до показу). */
export function calculatedAnswerValues(
  question: QuestionOf<'calculated'>,
  values: Readonly<Record<string, number>>,
): readonly (number | null)[] {
  return question.answers.map((answer) => {
    const compiled = compileFormula(answer.formula);
    if (!compiled.ok) return null;
    const result = compiled.value.evaluate(values);
    return result.ok ? result.value : null;
  });
}

export function gradeCalculated(
  question: QuestionOf<'calculated'>,
  layout: LayoutOf<'calculated'>,
  response: ResponseOf<'calculated'>,
): GradeResult {
  const values = calculatedAnswerValues(question, layout.values);
  const targets = question.answers.map((answer, index) => ({
    value: values[index] ?? null,
    tolerance: answer.tolerance,
    type: answer.toleranceType,
  }));
  return gradeAgainst(targets, question.answers.map((answer) => answer.fraction), response.answer);
}
