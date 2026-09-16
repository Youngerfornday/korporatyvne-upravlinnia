/** Розбір стовбура питання: пропуски `[[n]]` (ddwtos), мітки `{#n}` (Cloze), підстановка `{x}` (calculated). */
import { formatNumber } from '../../engines/shared/number-format';

export type StemPart = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'slot'; readonly index: number };

function splitBy(stem: string, pattern: RegExp): StemPart[] {
  const parts: StemPart[] = [];
  let last = 0;
  let order = 0;
  for (const match of stem.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: stem.slice(last, start) });
    parts.push({ kind: 'slot', index: order });
    order += 1;
    last = start + match[0].length;
  }
  if (last < stem.length) parts.push({ kind: 'text', text: stem.slice(last) });
  return parts;
}

/** Пропуски ddwtos у порядку появи: індекс — номер пропуску (як у `ddwtosGaps`). */
export function splitGapStem(stem: string): StemPart[] {
  return splitBy(stem, /\[\[\d+\]\]/g);
}

/** Мітки Cloze: індекс частини — номер мітки мінус 1 (`{#2}` → 1), не порядок появи. */
export function splitClozeStem(stem: string): StemPart[] {
  const parts: StemPart[] = [];
  let last = 0;
  for (const match of stem.matchAll(/\{#(\d+)\}/g)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: stem.slice(last, start) });
    parts.push({ kind: 'slot', index: Number(match[1]) - 1 });
    last = start + match[0].length;
  }
  if (last < stem.length) parts.push({ kind: 'text', text: stem.slice(last) });
  return parts;
}

/** `{p}` → значення варіанта набору даних у форматі uk-UA; невідомі змінні лишаються як є. */
export function substituteWildcards(stem: string, values: Readonly<Record<string, number>>): string {
  return stem.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : formatNumber(value);
  });
}
