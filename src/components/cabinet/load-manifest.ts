/**
 * Маніфест матеріалів `public/downloads/manifest.json` під час збирання сайту (лише сервер).
 * Немає файлу — кабінет показує стан «Матеріали ще не зібрано»; файл не відповідає схемі — збірка падає,
 * бо кабінет інакше мовчки показав би неповний або хибний перелік файлів.
 * E2E-збірка (KU_E2E_DOWNLOADS=1, e2e/site/playwright.config.ts) бере фікстурний маніфест.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DownloadManifestSchema, type DownloadManifest } from '../../content/schemas/downloads';
import { fixtureManifest } from './__fixtures__/manifest';

export const MANIFEST_FILE = 'public/downloads/manifest.json';
export const BUILD_DOWNLOADS_COMMAND = 'npm run build:downloads';

function isE2eDownloadsEnabled(): boolean {
  return typeof process !== 'undefined' && process.env['KU_E2E_DOWNLOADS'] === '1';
}

function readManifestText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export function parseManifest(text: string, source: string): DownloadManifest {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: некоректний JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = DownloadManifestSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.') || '(корінь)'}: ${issue.message}`).join('\n');
    throw new Error(`${source} не відповідає схемі маніфесту (src/content/schemas/downloads.ts):\n${issues}`);
  }
  return result.data;
}

/** Читається щоразу (файл малий): у `astro dev` новий маніфест видно без перезапуску. */
export function loadDownloadManifest(): DownloadManifest | null {
  if (isE2eDownloadsEnabled()) return fixtureManifest();
  const text = readManifestText(resolve(process.cwd(), MANIFEST_FILE));
  return text === null ? null : parseManifest(text, MANIFEST_FILE);
}
