/**
 * Збирання ZIP у браузері: завантаження вибраних файлів сайту, пакування fflate і збереження файлу.
 * Уже стиснені формати (PDF, DOCX, ZIP) пакуються без повторного стиснення — так швидше й не більше.
 */
import { strToU8, zip, zipSync, type Zippable } from 'fflate';
import { README_NAME, type ArchiveEntry } from './selection';

const CONCURRENCY = 3;
const COMPRESSIBLE = new Set(['xml', 'txt', 'html', 'csv', 'json', 'svg']);
const DEFLATE_LEVEL = 6;
const MAX_NAMED_FAILURES = 3;

export interface FileFailure {
  readonly path: string;
  readonly title: string;
  readonly reason: string;
}

/** Помилка завантаження одного чи кількох файлів: повідомлення українською для панелі вивантаження. */
export class DownloadError extends Error {
  readonly failures: readonly FileFailure[];

  constructor(failures: readonly FileFailure[]) {
    const named = failures.slice(0, MAX_NAMED_FAILURES).map((f) => `«${f.title}» (${f.reason})`);
    const rest = failures.length > MAX_NAMED_FAILURES ? ` і ще ${failures.length - MAX_NAMED_FAILURES}` : '';
    super(`Не вдалося завантажити ${named.join(', ')}${rest}. Перевірте з’єднання й спробуйте ще раз; якщо помилка повторюється, матеріали на сайті, імовірно, оновлюються.`);
    this.name = 'DownloadError';
    this.failures = failures;
  }
}

export interface FetchedFile {
  readonly path: string;
  readonly data: Uint8Array;
}

export interface FetchProgress {
  readonly done: number;
  readonly total: number;
  readonly bytes: number;
}

async function fetchOne(entry: ArchiveEntry, signal: AbortSignal): Promise<FetchedFile> {
  let response: Response;
  try {
    response = await fetch(entry.file.href, { signal, cache: 'no-cache' });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('немає з’єднання');
  }
  if (!response.ok) throw new Error(`помилка ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength === 0) throw new Error('порожній файл');
  return { path: entry.path, data };
}

/** Завантажує файли по кілька паралельно; збирає всі помилки, а не зупиняється на першій. */
export async function fetchEntries(
  entries: readonly ArchiveEntry[],
  signal: AbortSignal,
  onProgress: (progress: FetchProgress) => void,
): Promise<FetchedFile[]> {
  const results: (FetchedFile | undefined)[] = new Array(entries.length);
  const failures: FileFailure[] = [];
  let next = 0;
  let done = 0;
  let bytes = 0;

  const worker = async () => {
    while (next < entries.length && !signal.aborted) {
      const index = next;
      next += 1;
      const entry = entries[index];
      if (!entry) continue;
      try {
        const file = await fetchOne(entry, signal);
        results[index] = file;
        bytes += file.data.byteLength;
      } catch (error) {
        if (signal.aborted) return;
        failures.push({ path: entry.path, title: entry.material.title, reason: error instanceof Error ? error.message : String(error) });
      }
      done += 1;
      onProgress({ done, total: entries.length, bytes });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  if (signal.aborted) throw new DOMException('Скасовано', 'AbortError');
  if (failures.length > 0) throw new DownloadError(failures);
  return results.filter((file): file is FetchedFile => file !== undefined);
}

function extension(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
}

export function zippable(files: readonly FetchedFile[], readme: string, mtime: Date): Zippable {
  const entries: Zippable = { [README_NAME]: [strToU8(readme), { level: DEFLATE_LEVEL, mtime }] };
  for (const file of files) {
    entries[file.path] = [file.data, { level: COMPRESSIBLE.has(extension(file.path)) ? DEFLATE_LEVEL : 0, mtime }];
  }
  return entries;
}

/** fflate у вебворкерах; якщо браузер не дозволяє воркер — синхронно в основному потоці. */
export function createZip(data: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      zip(data, (error, archive) => {
        if (!error) {
          resolve(archive);
          return;
        }
        try {
          resolve(zipSync(data));
        } catch (syncError) {
          reject(syncError);
        }
      });
    } catch {
      try {
        resolve(zipSync(data));
      } catch (syncError) {
        reject(syncError);
      }
    }
  });
}

/** Зберігає архів через тимчасове посилання з атрибутом download. */
export function saveArchive(archive: Uint8Array, fileName: string): void {
  const blob = new Blob([archive as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
