import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DownloadManifestSchema, type DownloadManifest } from '../../src/content/schemas/downloads.ts';
import { DOWNLOADS_DIR } from './downloads-items.ts';

/**
 * Перевірка каталогу матеріалів проти маніфесту: схема, існування файлів, розміри в байтах і відсутність
 * файлів, яких немає в маніфесті. Той самий код викликає оркестратор перед публікацією і тест після збірки.
 */

export const MANIFEST_FILE = 'manifest.json';

/** Чи залишається відносний шлях усередині каталогу `public/downloads`. */
export function isDownloadPathContained(rootDir: string, file: string): boolean {
  const root = resolve(rootDir);
  const candidate = resolve(root, file);
  const within = relative(root, candidate);
  return within !== '' && within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within);
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

export interface ManifestCheck {
  readonly manifest: DownloadManifest | null;
  readonly issues: readonly string[];
}

export async function checkDownloadsDir(rootDir: string): Promise<ManifestCheck> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(rootDir, MANIFEST_FILE), 'utf8'));
  } catch (error) {
    return { manifest: null, issues: [`${MANIFEST_FILE} не прочитано: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const containmentIssues = Array.isArray((raw as { items?: unknown } | null)?.items)
    ? (raw as { items: unknown[] }).items.flatMap((item) => {
        if (typeof item !== 'object' || item === null || typeof (item as { path?: unknown }).path !== 'string') return [];
        const path = (item as { path: string }).path;
        if (!path.startsWith(`${DOWNLOADS_DIR}/`)) return [];
        return isDownloadPathContained(rootDir, path.slice(DOWNLOADS_DIR.length + 1))
          ? []
          : [`«${typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : '?'}»: шлях ${path} виходить за межі downloads`];
      })
    : [];
  const parsed = DownloadManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { manifest: null, issues: [...containmentIssues, ...parsed.error.issues.map((issue) => `${MANIFEST_FILE}: ${issue.path.join('.')}: ${issue.message}`)] };
  }
  const manifest = parsed.data;
  const listed = new Set<string>();
  const issues: string[] = [];
  for (const item of manifest.items) {
    if (item.path === undefined) continue;
    const file = item.path.slice(DOWNLOADS_DIR.length + 1);
    if (!isDownloadPathContained(rootDir, file)) {
      issues.push(`«${item.id}»: шлях ${item.path} виходить за межі downloads`);
      continue;
    }
    listed.add(file);
    const info = await stat(join(rootDir, file)).catch(() => null);
    if (info === null) issues.push(`«${item.id}»: немає файлу ${item.path}`);
    else if (info.size !== item.bytes) issues.push(`«${item.id}»: розмір ${item.path} — ${info.size} байт, у маніфесті ${item.bytes}`);
  }
  const unlisted = (await listFiles(rootDir)).filter((file) => file !== MANIFEST_FILE && !listed.has(file));
  issues.push(...unlisted.map((file) => `файл ${DOWNLOADS_DIR}/${file} не описано в маніфесті`));
  return { manifest, issues };
}
