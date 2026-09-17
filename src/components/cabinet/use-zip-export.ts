/** Стан збирання ZIP: завантаження файлів із прогресом, пакування, збереження, скасування й помилки. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { archiveFileName, readmeText, type ArchiveEntry, type ReadmeContext } from './selection';
import { createZip, fetchEntries, saveArchive, zippable } from './zip-export';

export type ZipState =
  | { readonly status: 'idle' }
  | { readonly status: 'fetching'; readonly done: number; readonly total: number; readonly bytes: number }
  | { readonly status: 'packing'; readonly total: number }
  | { readonly status: 'done'; readonly fileName: string; readonly files: number; readonly bytes: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string };

export interface ZipExport {
  readonly state: ZipState;
  readonly start: (entries: readonly ArchiveEntry[], context: Omit<ReadmeContext, 'collectedAt'>) => void;
  readonly cancel: () => void;
  readonly reset: () => void;
}

const UNEXPECTED = 'Не вдалося зібрати архів. Оновіть сторінку й спробуйте ще раз.';

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useZipExport(): ZipExport {
  const [state, setState] = useState<ZipState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback((entries: readonly ArchiveEntry[], context: Omit<ReadmeContext, 'collectedAt'>) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const collectedAt = new Date();
    setState({ status: 'fetching', done: 0, total: entries.length, bytes: 0 });

    const run = async () => {
      try {
        const files = await fetchEntries(entries, current.signal, (progress) => {
          if (!current.signal.aborted) setState({ status: 'fetching', ...progress });
        });
        setState({ status: 'packing', total: files.length });
        const readme = readmeText(entries, { ...context, collectedAt });
        const archive = await createZip(zippable(files, readme, collectedAt));
        if (current.signal.aborted) return;
        const fileName = archiveFileName(collectedAt);
        saveArchive(archive, fileName);
        setState({ status: 'done', fileName, files: files.length, bytes: archive.byteLength });
      } catch (error) {
        if (isAbort(error) || current.signal.aborted) {
          setState({ status: 'cancelled' });
          return;
        }
        setState({ status: 'error', message: error instanceof Error && error.name === 'DownloadError' ? error.message : UNEXPECTED });
      }
    };
    void run();
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState({ status: 'cancelled' });
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, cancel, reset };
}
