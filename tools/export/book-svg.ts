import { attr, hasClass, serializeHtml, textOf, type HtmlElement, type HtmlNode } from './html-tree.ts';

/**
 * SVG-схеми зі сторінки теми → окремі файли архіву Книги.
 *
 * Чому окремими файлами, а не inline: Moodle чистить вміст глави HTMLPurifier'ом, а вбудований `<style>`
 * усередині SVG і посилання на спрайт іконок після цього не гарантовані. Файл, завантажений разом із главою,
 * Moodle кладе у власне сховище і сам переписує посилання (перевірено у спайку: `<img>` показує SVG).
 *
 * Кольори: на сайті схеми беруть змінні теми (`var(--ink, #0f1c2e)`), а у файлі теми немає — тому змінні
 * замінюються конкретними кольорами світлої теми (значення за замовчуванням зі змінної або з карти нижче).
 */

/** Кольори світлої теми для змінних, у яких у розмітці не задано значення за замовчуванням. */
export const LIGHT_THEME_COLORS: Readonly<Record<string, string>> = {
  '--ink': '#0f1c2e',
  '--ink-2': '#445570',
  '--ink-3': '#6b7a93',
  '--surface': '#ffffff',
  '--surface-tint': '#eef4fa',
  '--line': '#d7e0ea',
  '--brand': '#005b9f',
  '--brand-ink': '#00305f',
  '--accent': '#867eb4',
  '--err': '#b42318',
  '--err-ink': '#8f1d14',
  '--ok': '#0f7b55',
};

const CSS_VAR = /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*?)\s*)?\)/gi;
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const VIEWBOX = /^\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*$/;

export interface SchemeFile {
  readonly path: string;
  readonly contents: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** `var(--ink, #0f1c2e)` → `#0f1c2e`; змінну без значення за замовчуванням шукаємо в карті теми. */
export function resolveCssVariables(source: string, colors: Readonly<Record<string, string>> = LIGHT_THEME_COLORS): {
  readonly text: string;
  readonly unresolved: readonly string[];
} {
  const unresolved: string[] = [];
  const text = source.replace(CSS_VAR, (whole, name: string, fallback: string | undefined) => {
    if (fallback !== undefined && fallback !== '') return fallback;
    const known = colors[name.toLowerCase()];
    if (known !== undefined) return known;
    unresolved.push(name);
    return whole;
  });
  return { text, unresolved: [...new Set(unresolved)] };
}

function viewBoxSize(element: HtmlElement): { width: number | null; height: number | null } {
  const explicitWidth = Number.parseFloat(attr(element, 'width') ?? '');
  const explicitHeight = Number.parseFloat(attr(element, 'height') ?? '');
  if (Number.isFinite(explicitWidth) && Number.isFinite(explicitHeight)) {
    return { width: Math.round(explicitWidth), height: Math.round(explicitHeight) };
  }
  const match = VIEWBOX.exec(attr(element, 'viewbox') ?? '');
  if (!match) return { width: null, height: null };
  return { width: Math.round(Number(match[1])), height: Math.round(Number(match[2])) };
}

/** Текст для `alt`: `<title>` схеми, інакше `<desc>`, інакше загальний підпис. */
function schemeAlt(element: HtmlElement): string {
  const pick = (tag: string): string => {
    const found = findFirst(element.children, tag);
    return found === null ? '' : textOf(found.children).replace(/\s+/g, ' ').trim();
  };
  return pick('title') || pick('desc') || 'Схема теми';
}

function findFirst(nodes: readonly HtmlNode[], tag: string): HtmlElement | null {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.tag.toLowerCase() === tag) return node;
    const nested = findFirst(node.children, tag);
    if (nested !== null) return nested;
  }
  return null;
}

export function isScheme(element: HtmlElement): boolean {
  return element.tag.toLowerCase() === 'svg' && hasClass(element, 'scheme');
}

/** Вбудований `<svg class="scheme">` → самостійний файл SVG зі своїми просторами імен і кольорами теми. */
export function schemeToFile(element: HtmlElement, fallbackName: string, directory: string): {
  readonly file: SchemeFile;
  readonly warnings: readonly string[];
} {
  const name = (attr(element, 'id') ?? fallbackName).replace(/[^A-Za-z0-9_-]/g, '-');
  const size = viewBoxSize(element);
  const serialized = serializeHtml([withNamespaces(element, size)]);
  const { text, unresolved } = resolveCssVariables(serialized);
  const warnings = unresolved.map((variable) => `схема ${name}: змінна ${variable} без значення за замовчуванням`);
  return {
    file: {
      path: `${directory}/${name}.svg`,
      contents: `<?xml version="1.0" encoding="UTF-8"?>\n${text}\n`,
      alt: schemeAlt(element),
      width: size.width,
      height: size.height,
    },
    warnings,
  };
}

function withNamespaces(element: HtmlElement, size: { width: number | null; height: number | null }): HtmlElement {
  const kept = element.attrs.filter(([key]) => {
    const name = key.toLowerCase();
    return name !== 'class' && name !== 'xmlns' && name !== 'xmlns:xlink' && name !== 'width' && name !== 'height';
  });
  const usesXlink = serializeHtml(element.children).includes('xlink:');
  const size2: Array<readonly [string, string | null]> =
    size.width === null || size.height === null ? [] : [['width', String(size.width)], ['height', String(size.height)]];
  return {
    ...element,
    attrs: [
      ['xmlns', SVG_NS],
      ...(usesXlink ? ([['xmlns:xlink', XLINK_NS]] as Array<readonly [string, string | null]>) : []),
      ...size2,
      ...kept,
    ],
  };
}
