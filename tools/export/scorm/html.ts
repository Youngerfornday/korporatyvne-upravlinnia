import { fontFaceCss } from '../../../src/lib/fonts.ts';
import { escapeHtml } from '../text.ts';
import { PACKAGE_DATA_ELEMENT_ID, PACKAGE_NOTICE_ELEMENT_ID, PACKAGE_ROOT_ELEMENT_ID, packageDataScript } from './app/data.ts';
import type { ScormPackageSpec } from './catalog.ts';

/**
 * `index.html` пакета SCORM: заголовок тренажера, спрайт іконок сайту, вбудовані дані острова й відносні
 * посилання на зібрані стилі, скрипт і шрифти пакета. Звичайний (не module) скрипт з `defer` працює і в плеєрі
 * Moodle, і з розпакованого архіву через file://.
 */

export const APP_SCRIPT = 'assets/app.js';
export const APP_STYLES = 'assets/app.css';

/** Спрайт `#i-*` з Icons.astro без frontmatter — одне джерело іконок для сайту й пакетів. */
export function spriteFromIconsAstro(source: string): string {
  const body = source.replace(/^---[\s\S]*?---\s*/, '').trim();
  if (!body.startsWith('<svg') || !body.includes('id="i-check"')) throw new Error('Icons.astro: не знайдено спрайт іконок <svg> із символами #i-*');
  return body;
}

export interface PackageHtmlInput {
  readonly spec: ScormPackageSpec;
  readonly courseTitle: string;
  readonly sprite: string;
}

export function packageHtml({ spec, courseTitle, sprite }: PackageHtmlInput): string {
  const fonts = fontFaceCss((path) => `./${path}`);
  const facts = spec.facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join('');
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(`${spec.title} — ${courseTitle}`)}</title>
<style>${fonts}</style>
<link rel="stylesheet" href="./${APP_STYLES}">
<script defer src="./${APP_SCRIPT}"></script>
</head>
<body>
${sprite}
<main id="main" class="container scorm-page" data-scorm-package="${escapeHtml(spec.id)}">
<header class="topic-head">
<p class="kicker">${escapeHtml(spec.kicker)}</p>
<h1 class="h1">${escapeHtml(spec.title)}</h1>
<p class="lede">${escapeHtml(spec.lede)}</p>
<div class="topic-facts">${facts}</div>
</header>
<p class="scorm-notice" id="${PACKAGE_NOTICE_ELEMENT_ID}" role="status" aria-live="polite" hidden></p>
<div id="${PACKAGE_ROOT_ELEMENT_ID}">
<p class="muted" aria-busy="true">Тренажер завантажується. Якщо цей напис не зникає, увімкніть JavaScript.</p>
</div>
</main>
<script type="application/json" id="${PACKAGE_DATA_ELEMENT_ID}">${packageDataScript(spec.data)}</script>
</body>
</html>
`;
}
