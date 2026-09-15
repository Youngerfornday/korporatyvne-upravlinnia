#!/usr/bin/env node
/**
 * npm run screens — скріншоти реалізації 1440/390, світла й темна тема → design/screens/impl/ (не комітяться).
 * Потрібен запущений `astro preview` (або будь-який сервер за SCREENS_URL) після `astro build`.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUT = resolve(ROOT, 'design/screens/impl');
const BASE = process.env['SCREENS_URL'] ?? 'http://localhost:4321/korporatyvne-upravlinnia/';
const PAGES = [
  ['index', ''],
  ['module', 'moduli/m1/'],
  ['topic-pending', 'temy/korporatsiia-i-korporatyvne-upravlinnia/'],
  ['components', 'rozrobka/komponenty/'],
];
const VIEWPORTS = [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }],
];
const THEMES = ['light', 'dark'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [width, viewport] of VIEWPORTS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1, locale: 'uk-UA' });
    const page = await context.newPage();
    for (const [name, path] of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const suffix = theme === 'dark' ? '-dark' : '';
      await page.screenshot({ path: resolve(OUT, `${name}-${width}${suffix}.png`), fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
console.log(`Скріншоти збережено в ${OUT}`);
