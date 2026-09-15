import { err, ok, type Result } from '../shared/result';
import { EvaluationFailure, evaluateNode, type EvaluationErrorCode } from './expression/evaluate';
import { collectPlaceholders, parseFormula, type FormulaNode, type SyntaxErrorCode } from './expression/parser';

/**
 * Безпечні формули Moodle calculated: валідатор для схеми банку й обчислювач для рушія тесту.
 * Граматика — підмножина PHP-виразу, яку приймає `qtype_calculated_find_formula_errors`
 * (Moodle 5.2): числа, {змінні}, + - * / % **, дужки й функції з allowlist.
 * Порівняння, тернарний оператор і `^` (у PHP це XOR, а не степінь) не підтримуються —
 * так само їх відсікає схема банку.
 */
export type FormulaErrorCode = SyntaxErrorCode | EvaluationErrorCode | 'not-finite';

export interface FormulaError {
  readonly code: FormulaErrorCode;
  /** Повідомлення українською для автора банку або журналу збірки. */
  readonly message: string;
  /** Позиція символу (з 0) для синтаксичних помилок. */
  readonly position?: number;
}

export interface ValidateFormulaOptions {
  /** Дозволені імена {змінних}; якщо не задано — будь-які. */
  readonly variables?: readonly string[];
}

export interface CompiledFormula {
  readonly placeholders: readonly string[];
  evaluate(values: Readonly<Record<string, number>>): Result<number, FormulaError>;
}

function evaluateCompiled(ast: FormulaNode, values: Readonly<Record<string, number>>): Result<number, FormulaError> {
  try {
    const result = evaluateNode(ast, new Map(Object.entries(values)));
    if (!Number.isFinite(result)) {
      return err({ code: 'not-finite', message: 'Результат формули не є скінченним числом (NaN або нескінченність)' });
    }
    return ok(result);
  } catch (error) {
    if (error instanceof EvaluationFailure) return err({ code: error.code, message: error.message });
    throw error;
  }
}

export function compileFormula(formula: string): Result<CompiledFormula, FormulaError> {
  const parsed = parseFormula(formula);
  if ('error' in parsed) return err(parsed.error);
  const { ast } = parsed;
  return ok({ placeholders: collectPlaceholders(ast), evaluate: (values) => evaluateCompiled(ast, values) });
}

/** Перевіряє граматику, функції, арність і (за потреби) імена змінних. Нічого не обчислює. */
export function validateFormula(
  formula: string,
  options: ValidateFormulaOptions = {},
): Result<{ readonly placeholders: readonly string[] }, FormulaError> {
  const compiled = compileFormula(formula);
  if (!compiled.ok) return compiled;
  const { placeholders } = compiled.value;
  const allowed = options.variables;
  const unknown = allowed ? placeholders.find((name) => !allowed.includes(name)) : undefined;
  if (unknown !== undefined) {
    return err({ code: 'unknown-variable', message: `Змінна {${unknown}} не має набору даних` });
  }
  return ok({ placeholders });
}

export function evaluateFormula(formula: string, values: Readonly<Record<string, number>>): Result<number, FormulaError> {
  const compiled = compileFormula(formula);
  return compiled.ok ? compiled.value.evaluate(values) : compiled;
}
