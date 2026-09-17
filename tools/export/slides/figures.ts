import { readFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';

/** Підставний рендерер дає змогу тестувати PPTX без запуску Chromium у пісочниці. */
export type SvgRenderer = (svg: string) => Promise<Buffer>;

const LIGHT_TOKENS = `
:root {
  --surface: #ffffff;
  --surface-tint: #eef4fa;
  --ink: #0f1c2e;
  --ink-2: #445570;
  --ink-3: #5f6f88;
  --err: #b42318;
  --err-ink: #8f1d14;
}
`;

function viewBoxSize(svg: string): { width: number; height: number } {
  const match = /viewBox\s*=\s*["']\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+([\d.]+)\s+([\d.]+)\s*["']/u.exec(svg);
  if (!match) throw new Error('SVG-схема не має коректного viewBox');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0)) throw new Error('SVG-схема має порожній viewBox');
  return { width, height };
}

/** Рендерить SVG у PNG з deviceScaleFactor 2 і світлими fallback-токенами. */
export const playwrightSvgRenderer: SvgRenderer = async (svg: string): Promise<Buffer> => {
  const size = viewBoxSize(svg);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      colorScheme: 'light',
      deviceScaleFactor: 2,
      viewport: { width: Math.ceil(size.width), height: Math.ceil(size.height) },
    });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html lang="uk"><head><style>${LIGHT_TOKENS}html,body{margin:0;padding:0;background:#fff}svg{display:block;width:${size.width}px;height:${size.height}px}</style></head><body>${svg}</body></html>`);
    const image = await page.locator('svg').screenshot({ type: 'png' });
    await context.close();
    return image;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n', 1)[0] : String(error).split('\n', 1)[0];
    throw new Error(`Растеризація SVG через Chromium не вдалася: ${message}. У цьому середовищі Chromium недоступний.`);
  } finally {
    await browser?.close();
  }
};

export async function rasterizeSvg(svg: string, renderer: SvgRenderer = playwrightSvgRenderer): Promise<Buffer> {
  return renderer(svg);
}

export async function rasterizeSvgFile(file: string, renderer: SvgRenderer = playwrightSvgRenderer): Promise<Buffer> {
  return rasterizeSvg(await readFile(file, 'utf8'), renderer);
}

export function svgAspectRatio(svg: string): number {
  const size = viewBoxSize(svg);
  return size.width / size.height;
}
