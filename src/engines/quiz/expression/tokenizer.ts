/** Лексер формул Moodle calculated. Лише числа, {змінні}, імена функцій, + - * / % ** ( ) і кома. */

export type Token =
  | { readonly kind: 'number'; readonly value: number; readonly position: number }
  | { readonly kind: 'placeholder'; readonly name: string; readonly position: number }
  | { readonly kind: 'identifier'; readonly name: string; readonly position: number }
  | { readonly kind: 'operator'; readonly symbol: Operator; readonly position: number }
  | { readonly kind: 'end'; readonly position: number };

export type Operator = '+' | '-' | '*' | '/' | '%' | '**' | '(' | ')' | ',';

export interface LexError {
  readonly position: number;
  readonly fragment: string;
}

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const PLACEHOLDER = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const WHITESPACE = /^\s+/;
const SINGLE_OPERATORS = new Set<string>(['+', '-', '*', '/', '%', '(', ')', ',']);

function readToken(source: string, position: number): Token | null {
  const rest = source.slice(position);
  if (rest.startsWith('**')) return { kind: 'operator', symbol: '**', position };

  const first = rest.charAt(0);
  if (SINGLE_OPERATORS.has(first)) return { kind: 'operator', symbol: first as Operator, position };

  const number = NUMBER.exec(rest);
  if (number) return { kind: 'number', value: Number(number[0]), position };

  const placeholder = PLACEHOLDER.exec(rest);
  if (placeholder) return { kind: 'placeholder', name: placeholder[1] ?? '', position };

  const identifier = IDENTIFIER.exec(rest);
  if (identifier) return { kind: 'identifier', name: identifier[0], position };
  return null;
}

function tokenLength(token: Token, source: string): number {
  switch (token.kind) {
    case 'operator':
      return token.symbol.length;
    case 'placeholder':
      return token.name.length + 2;
    case 'identifier':
      return token.name.length;
    default:
      return (NUMBER.exec(source.slice(token.position))?.[0] ?? '').length;
  }
}

export function tokenize(source: string): { readonly tokens: readonly Token[] } | { readonly error: LexError } {
  const tokens: Token[] = [];
  let position = 0;
  while (position < source.length) {
    const space = WHITESPACE.exec(source.slice(position));
    if (space) {
      position += space[0].length;
      continue;
    }
    const token = readToken(source, position);
    if (!token) return { error: { position, fragment: source.charAt(position) } };
    tokens.push(token);
    position += tokenLength(token, source);
  }
  tokens.push({ kind: 'end', position });
  return { tokens };
}
