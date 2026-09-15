import { defineHastPlugin, type HastNode, type HastVisitorContext } from 'satteri';
import { normalizeTypography } from './normalize.ts';

/**
 * Hast-плагін Sätteri (Astro 7 рендерить Markdown і MDX через Sätteri, а не remark/rehype):
 * нормалізує українську типографіку в текстових вузлах. Не чіпає код, скрипти, стилі, формули,
 * атрибути (їх немає серед текстових вузлів) і адреси (їх захищає normalizeTypography).
 * У заголовках нерозривні пробіли не ставляться, щоб якорі лишалися чистими.
 */
const SKIPPED_ELEMENTS = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'svg', 'math', 'textarea']);
const SKIPPED_COMPONENTS = new Set(['Formula', 'code', 'pre', 'kbd', 'script', 'style', 'svg']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

type Ancestry = { readonly skip: boolean; readonly heading: boolean };

function hasTypographyOff(node: HastNode): boolean {
  if (node.type === 'element') return node.properties?.['dataTypography'] === 'off';
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    return node.attributes.some((attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'data-typography' && attr.value === 'off');
  }
  return false;
}

function classify(node: HastNode, ctx: HastVisitorContext): Ancestry {
  let skip = false;
  let heading = false;
  let current: HastNode | undefined = ctx.parent(node);
  while (current && current.type !== 'root') {
    if (hasTypographyOff(current)) skip = true;
    if (current.type === 'element') {
      if (SKIPPED_ELEMENTS.has(current.tagName)) skip = true;
      if (HEADINGS.has(current.tagName)) heading = true;
    } else if ((current.type === 'mdxJsxFlowElement' || current.type === 'mdxJsxTextElement') && current.name) {
      if (SKIPPED_COMPONENTS.has(current.name)) skip = true;
    }
    current = ctx.parent(current);
  }
  return { skip, heading };
}

export const typographyPlugin = defineHastPlugin({
  name: 'ku-typography',
  text(node, ctx) {
    const { skip, heading } = classify(node, ctx);
    if (skip) return;
    const value = normalizeTypography(node.value, { nbsp: !heading });
    if (value === node.value) return;
    return { type: 'text', value };
  },
});
