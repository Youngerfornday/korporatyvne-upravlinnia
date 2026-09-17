import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { DownloadManifestSchema, type DownloadManifest } from '../../src/content/schemas/downloads.ts';
import { DOWNLOADS_DIR } from './downloads-items.ts';

/**
 * Перевірка каталогу матеріалів проти маніфесту: схема, існування файлів, розміри в байтах і відсутність
 * файлів, яких немає в маніфесті. Той самий код викликає оркестратор перед публікацією і тест після збірки.
 */

export const MANIFEST_FILE = 'manifest.json';

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
  const parsed = DownloadManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { manifest: null, issues: parsed.error.issues.map((issue) => `${MANIFEST_FILE}: ${issue.path.join('.')}: ${issue.message}`) };
  }
  const manifest = parsed.data;
  const listed = new Set<string>();
  const issues: string[] = [];
  for (const item of manifest.items) {
    if (item.path === undefined) continue;
    const file = item.path.slice(DOWNLOADS_DIR.length + 1);
    listed.add(file);
    const info = await stat(join(rootDir, file)).catch(() => null);
    if (info === null) issues.push(`«${item.id}»: немає файлу ${item.path}`);
    else if (info.size !== item.bytes) issues.push(`«${item.id}»: розмір ${item.path} — ${info.size} байт, у маніфесті ${item.bytes}`);
  }
  const unlisted = (await listFiles(rootDir)).filter((file) => file !== MANIFEST_FILE && !listed.has(file));
  issues.push(...unlisted.map((file) => `файл ${DOWNLOADS_DIR}/${file} не описано в маніфесті`));
  return { manifest, issues };
}
