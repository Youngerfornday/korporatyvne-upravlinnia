import { FORMULA_FUNCTIONS } from './functions';
import type { FormulaNode } from './parser';

export type EvaluationErrorCode = 'division-by-zero' | 'unknown-variable';

export class EvaluationFailure extends Error {
  constructor(
    readonly code: EvaluationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Values = ReadonlyMap<string, number>;

/** PHP 8: `%` приводить операнди до цілих; ділення на нуль — DivisionByZeroError. */
function modulo(left: number, right: number): number {
  const divisor = Math.trunc(right);
  if (divisor === 0) throw new EvaluationFailure('division-by-zero', 'Остача від ділення на нуль');
  return Math.trunc(left) % divisor;
}

function divide(left: number, right: number): number {
  if (right === 0) throw new EvaluationFailure('division-by-zero', 'Ділення на нуль');
  return left / right;
}

function binary(operator: string, left: number, right: number): number {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return divide(left, right);
    case '%':
      return modulo(left, right);
    default:
      return left ** right;
  }
}

export function evaluateNode(node: FormulaNode, values: Values): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'placeholder': {
      const value = values.get(node.name);
      if (value === undefined) throw new EvaluationFailure('unknown-variable', `Для змінної {${node.name}} немає значення`);
      return value;
    }
    case 'unary': {
      const operand = evaluateNode(node.operand, values);
      return node.operator === '-' ? -operand : operand;
    }
    case 'binary':
      return binary(node.operator, evaluateNode(node.left, values), evaluateNode(node.right, values));
    default: {
      // Парсер пропускає лише функції з allowlist, тож тут вона завжди є.
      const fn = FORMULA_FUNCTIONS.get(node.name);
      return fn ? fn.apply(node.args.map((argument) => evaluateNode(argument, values))) : Number.NaN;
    }
  }
}
