/**
 * Функції, які дозволяє Moodle 5.2 у формулах calculated (`qtype_calculated_find_formula_errors`),
 * з тією самою арністю й семантикою PHP. Інших функцій не існує — це і є allowlist.
 */

export interface FormulaFunction {
  readonly minArgs: number;
  /** null — без верхньої межі (min, max). */
  readonly maxArgs: number | null;
  readonly apply: (args: readonly number[]) => number;
}

const INT64_BITS = 64;
const PRE_ROUNDING_DIGITS = 15;

function arg(args: readonly number[], index: number): number {
  return args[index] ?? Number.NaN;
}

function unary(fn: (x: number) => number): FormulaFunction {
  return { minArgs: 1, maxArgs: 1, apply: (args) => fn(arg(args, 0)) };
}

function flag(value: boolean): number {
  return value ? 1 : 0;
}

/** PHP round(): половина — від нуля; precision може бути від’ємною. */
function phpRound(value: number, precision = 0): number {
  const places = Math.trunc(precision);
  const scale = 10 ** Math.abs(places);
  const scaled = places >= 0 ? value * scale : value / scale;
  const rounded = Math.sign(scaled) * Math.round(Number(Math.abs(scaled).toPrecision(PRE_ROUNDING_DIGITS)));
  return places >= 0 ? rounded / scale : rounded * scale;
}

/** decbin/decoct: ціле в 64-бітному доповнювальному коді, результат-рядок PHP читає як десяткове число. */
function toBase(value: number, radix: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return Number(BigInt.asUintN(INT64_BITS, BigInt(Math.trunc(value))).toString(radix));
}

/** bindec/octdec: PHP перетворює аргумент на рядок і пропускає символи, недопустимі в системі числення. */
function fromBase(value: number, digits: RegExp, radix: number): number {
  const valid = String(value).replace(digits, '');
  return valid === '' ? 0 : Number.parseInt(valid, radix);
}

const ENTRIES: ReadonlyArray<readonly [string, FormulaFunction]> = [
  ['abs', unary(Math.abs)],
  ['acos', unary(Math.acos)],
  ['acosh', unary(Math.acosh)],
  ['asin', unary(Math.asin)],
  ['asinh', unary(Math.asinh)],
  ['atan', unary(Math.atan)],
  ['atanh', unary(Math.atanh)],
  ['bindec', unary((x) => fromBase(x, /[^01]/g, 2))],
  ['ceil', unary(Math.ceil)],
  ['cos', unary(Math.cos)],
  ['cosh', unary(Math.cosh)],
  ['decbin', unary((x) => toBase(x, 2))],
  ['decoct', unary((x) => toBase(x, 8))],
  ['deg2rad', unary((x) => (x * Math.PI) / 180)],
  ['exp', unary(Math.exp)],
  ['expm1', unary(Math.expm1)],
  ['floor', unary(Math.floor)],
  ['is_finite', unary((x) => flag(Number.isFinite(x)))],
  ['is_infinite', unary((x) => flag(x === Infinity || x === -Infinity))],
  ['is_nan', unary((x) => flag(Number.isNaN(x)))],
  ['log10', unary(Math.log10)],
  ['log1p', unary(Math.log1p)],
  ['octdec', unary((x) => fromBase(x, /[^0-7]/g, 8))],
  ['rad2deg', unary((x) => (x * 180) / Math.PI)],
  ['sin', unary(Math.sin)],
  ['sinh', unary(Math.sinh)],
  ['sqrt', unary(Math.sqrt)],
  ['tan', unary(Math.tan)],
  ['tanh', unary(Math.tanh)],
  ['pi', { minArgs: 0, maxArgs: 0, apply: () => Math.PI }],
  [
    'log',
    {
      minArgs: 1,
      maxArgs: 2,
      apply: (args) => (args.length === 2 ? Math.log(arg(args, 0)) / Math.log(arg(args, 1)) : Math.log(arg(args, 0))),
    },
  ],
  ['round', { minArgs: 1, maxArgs: 2, apply: (args) => phpRound(arg(args, 0), args[1]) }],
  ['atan2', { minArgs: 2, maxArgs: 2, apply: (args) => Math.atan2(arg(args, 0), arg(args, 1)) }],
  ['fmod', { minArgs: 2, maxArgs: 2, apply: (args) => arg(args, 0) % arg(args, 1) }],
  ['pow', { minArgs: 2, maxArgs: 2, apply: (args) => arg(args, 0) ** arg(args, 1) }],
  ['min', { minArgs: 2, maxArgs: null, apply: (args) => Math.min(...args) }],
  ['max', { minArgs: 2, maxArgs: null, apply: (args) => Math.max(...args) }],
];

/** Map, а не об’єкт: ім’я на кшталт `constructor` не знайде нічого з прототипу. */
export const FORMULA_FUNCTIONS: ReadonlyMap<string, FormulaFunction> = new Map(ENTRIES);

export function describeArity(fn: FormulaFunction): string {
  if (fn.maxArgs === null) return `щонайменше ${fn.minArgs}`;
  if (fn.minArgs === fn.maxArgs) return String(fn.minArgs);
  return `від ${fn.minArgs} до ${fn.maxArgs}`;
}
