import { FORMULA_FUNCTIONS, describeArity } from './functions';
import { tokenize, type Operator, type Token } from './tokenizer';

/**
 * Синтаксичний аналізатор (рекурсивний спуск) з пріоритетами PHP:
 * `**` (правоасоціативний, сильніший за унарний мінус: -2 ** 2 = -4) → унарні + - → * / % → + -.
 * Нічого не виконує: будує дерево, яке обчислює evaluate.ts. Жодного eval/Function.
 */
export type FormulaNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'placeholder'; readonly name: string }
  | { readonly kind: 'unary'; readonly operator: '+' | '-'; readonly operand: FormulaNode }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly FormulaNode[] };

export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '**';

export type SyntaxErrorCode = 'syntax' | 'unknown-function' | 'wrong-arity' | 'too-long' | 'too-deep';

export interface FormulaSyntaxError {
  readonly code: SyntaxErrorCode;
  readonly message: string;
  readonly position?: number;
}

export const MAX_FORMULA_LENGTH = 2000;
export const MAX_FORMULA_DEPTH = 100;

class ParseFailure extends Error {
  constructor(readonly detail: FormulaSyntaxError) {
    super(detail.message);
  }
}

function fail(code: SyntaxErrorCode, message: string, position?: number): never {
  throw new ParseFailure(position === undefined ? { code, message } : { code, message, position });
}

function describeToken(token: Token): string {
  switch (token.kind) {
    case 'end':
      return 'кінець формули';
    case 'number':
      return `число ${token.value}`;
    case 'placeholder':
      return `{${token.name}}`;
    case 'identifier':
      return `«${token.name}»`;
    default:
      return `«${token.symbol}»`;
  }
}

class Parser {
  private index = 0;
  private depth = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): FormulaNode {
    const node = this.additive();
    const next = this.peek();
    if (next.kind !== 'end') fail('syntax', `Зайвий елемент: ${describeToken(next)}`, next.position);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: 'end', position: 0 };
  }

  private isOperator(...symbols: Operator[]): boolean {
    const token = this.peek();
    return token.kind === 'operator' && symbols.includes(token.symbol);
  }

  private take(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private expect(symbol: Operator): void {
    const token = this.take();
    if (token.kind !== 'operator' || token.symbol !== symbol) {
      fail('syntax', `Очікувалося «${symbol}», а знайдено ${describeToken(token)}`, token.position);
    }
  }

  private nested<T>(parse: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_FORMULA_DEPTH) fail('too-deep', `Формула вкладена глибше ніж на ${MAX_FORMULA_DEPTH} рівнів`);
    const node = parse();
    this.depth -= 1;
    return node;
  }

  private additive(): FormulaNode {
    let node = this.multiplicative();
    while (this.isOperator('+', '-')) {
      const operator = (this.take() as { symbol: '+' | '-' }).symbol;
      node = { kind: 'binary', operator, left: node, right: this.multiplicative() };
    }
    return node;
  }

  private multiplicative(): FormulaNode {
    let node = this.unary();
    while (this.isOperator('*', '/', '%')) {
      const operator = (this.take() as { symbol: '*' | '/' | '%' }).symbol;
      node = { kind: 'binary', operator, left: node, right: this.unary() };
    }
    return node;
  }

  private unary(): FormulaNode {
    return this.nested(() => {
      if (this.isOperator('+', '-')) {
        const operator = (this.take() as { symbol: '+' | '-' }).symbol;
        return { kind: 'unary', operator, operand: this.unary() };
      }
      return this.power();
    });
  }

  private power(): FormulaNode {
    const base = this.primary();
    if (!this.isOperator('**')) return base;
    this.take();
    return { kind: 'binary', operator: '**', left: base, right: this.unary() };
  }

  private primary(): FormulaNode {
    const token = this.take();
    switch (token.kind) {
      case 'number':
        return { kind: 'number', value: token.value };
      case 'placeholder':
        return { kind: 'placeholder', name: token.name };
      case 'identifier':
        return this.call(token.name, token.position);
      case 'operator':
        if (token.symbol === '(') return this.parenthesised(token.position);
        return fail('syntax', `Неочікуваний знак «${token.symbol}»`, token.position);
      default:
        return fail('syntax', 'Формула обривається: бракує числа, змінної або дужки', token.position);
    }
  }

  private parenthesised(position: number): FormulaNode {
    if (this.isOperator(')')) fail('syntax', 'Порожні дужки', position);
    const inner = this.nested(() => this.additive());
    this.expect(')');
    return inner;
  }

  private call(rawName: string, position: number): FormulaNode {
    const name = rawName.toLowerCase();
    if (!this.isOperator('(')) {
      fail('syntax', `Невідоме слово «${rawName}»: змінні записуються у фігурних дужках, наприклад {x}`, position);
    }
    const fn = FORMULA_FUNCTIONS.get(name);
    if (!fn) fail('unknown-function', `Функція «${rawName}» не підтримується Moodle`, position);
    this.take();
    const args = this.isOperator(')') ? [] : this.argumentList();
    this.expect(')');
    const tooFew = args.length < fn.minArgs;
    const tooMany = fn.maxArgs !== null && args.length > fn.maxArgs;
    if (tooFew || tooMany) {
      fail('wrong-arity', `Функція «${name}» приймає аргументів: ${describeArity(fn)}, передано ${args.length}`, position);
    }
    return { kind: 'call', name, args };
  }

  private argumentList(): FormulaNode[] {
    const args = [this.nested(() => this.additive())];
    while (this.isOperator(',')) {
      this.take();
      args.push(this.nested(() => this.additive()));
    }
    return args;
  }
}

export function parseFormula(source: string): { readonly ast: FormulaNode } | { readonly error: FormulaSyntaxError } {
  if (source.length > MAX_FORMULA_LENGTH) {
    return { error: { code: 'too-long', message: `Формула довша за ${MAX_FORMULA_LENGTH} символів` } };
  }
  const lexed = tokenize(source);
  if ('error' in lexed) {
    const { position, fragment } = lexed.error;
    // Moodle 5.2 відсікає ^ у qtype_calculated_find_formula_errors: у PHP це побітове XOR, а не степінь.
    const message =
      fragment === '^'
        ? 'Знак ^ у формулах Moodle не означає степінь (у PHP це побітове XOR): пишіть pow(x, y).'
        : `Недопустимий символ «${fragment}»`;
    return { error: { code: 'syntax', message, position } };
  }
  try {
    return { ast: new Parser(lexed.tokens).parse() };
  } catch (error) {
    if (error instanceof ParseFailure) return { error: error.detail };
    throw error;
  }
}

export function collectPlaceholders(node: FormulaNode, found: readonly string[] = []): readonly string[] {
  switch (node.kind) {
    case 'number':
      return found;
    case 'placeholder':
      return found.includes(node.name) ? found : [...found, node.name];
    case 'unary':
      return collectPlaceholders(node.operand, found);
    case 'binary':
      return collectPlaceholders(node.right, collectPlaceholders(node.left, found));
    default:
      return node.args.reduce<readonly string[]>((acc, argument) => collectPlaceholders(argument, acc), found);
  }
}
