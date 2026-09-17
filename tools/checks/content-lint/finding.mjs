/** Спільний тип знахідки лінту контенту і допоміжні конструктори. */

export const ERROR = 'error';
export const WARNING = 'warning';

/** @typedef {{ file: string, line: number, rule: string, level: 'error'|'warning', message: string, hint: string, quote?: string }} Finding */

/**
 * @param {Finding} finding
 * @returns {Finding}
 */
export function makeFinding(finding) {
  return { quote: undefined, ...finding };
}
