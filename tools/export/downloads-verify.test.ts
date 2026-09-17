import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDownloadsDir, isDownloadPathContained } from './downloads-verify';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('checkDownloadsDir', () => {
  it('визначає вихід за межі public/downloads через resolve', () => {
    const root = join('/tmp', 'course', 'public', 'downloads');
    expect(isDownloadPathContained(root, 'a/../../../secret.txt')).toBe(false);
    expect(isDownloadPathContained(root, 'm1/lecture.pdf')).toBe(true);
  });

  it('відхиляє небезпечний шлях до перевірки файлу', async () => {
    const base = await mkdtemp('/tmp/cpnu-downloads-');
    temporary.push(base);
    const root = join(base, 'public', 'downloads');
    await mkdir(root, { recursive: true });
    await writeFile(join(base, 'public', 'secret.txt'), 'secret');
    await writeFile(join(root, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-17T12:00:00Z',
      items: [{
        id: 'secret-file',
        title: 'Секрет',
        kind: 'lecture',
        format: 'pdf',
        path: 'downloads/../secret.txt',
        bytes: 6,
      }],
    }));

    const result = await checkDownloadsDir(root);

    expect(result.manifest).toBeNull();
    expect(result.issues.some((issue) => issue.includes('за межі downloads'))).toBe(true);
  });
});
