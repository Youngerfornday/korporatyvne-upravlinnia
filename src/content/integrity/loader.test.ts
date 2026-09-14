import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';
import { afterEach, describe, expect, it } from 'vitest';
import { withIntegrityCheck } from './loader';

const PROJECT_ROOT = new URL('../../../', import.meta.url);

type StoredEntry = { id: string; filePath?: string; data: Record<string, unknown> };

function fakeContext(root: URL, entries: StoredEntry[]): LoaderContext {
  return {
    collection: 'glossary',
    config: { root },
    store: { values: () => entries },
  } as unknown as LoaderContext;
}

const innerLoader = (): Loader & { calls: number } => {
  const loader = {
    name: 'glob-loader',
    calls: 0,
    load: async () => {
      loader.calls += 1;
    },
  };
  return loader;
};

describe('withIntegrityCheck', () => {
  let tempRoot: string | undefined;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  it('runs the inner loader, then passes stored entries and the real registry to the check', async () => {
    // Arrange
    const inner = innerLoader();
    const seen: Array<{ filePath: string; topics: number }> = [];
    const loader = withIntegrityCheck<{ topic: string }>(inner, (entries, course) => {
      seen.push(...entries.map((entry) => ({ filePath: entry.filePath, topics: course.topics.length })));
      return [];
    });
    const context = fakeContext(PROJECT_ROOT, [
      { id: 'm1/t01/glossary', filePath: 'content/modules/m1/t01/glossary.yaml', data: { topic: 't01' } },
      { id: 'no-file-path', data: { topic: 't02' } },
    ]);

    // Act
    await loader.load(context);

    // Assert
    expect(loader.name).toBe('glob-loader+integrity');
    expect(inner.calls).toBe(1);
    expect(seen).toEqual([
      { filePath: 'content/modules/m1/t01/glossary.yaml', topics: 12 },
      { filePath: 'no-file-path', topics: 12 },
    ]);
  });

  it('fails the load with a readable report when the check finds issues', async () => {
    // Arrange
    const loader = withIntegrityCheck(innerLoader(), () => [{ file: 'content/x.yaml', message: 'Дублікат ID терміна «x»' }]);

    // Act and Assert
    await expect(loader.load(fakeContext(PROJECT_ROOT, []))).rejects.toThrow(
      /колекції «glossary» не пройдена \(1\):\n {2}- content\/x\.yaml: Дублікат ID терміна «x»/,
    );
  });

  it('fails with a clear message when course.yaml itself is invalid', async () => {
    // Arrange
    tempRoot = mkdtempSync(join(tmpdir(), 'ku-loader-'));
    mkdirSync(join(tempRoot, 'content'));
    writeFileSync(join(tempRoot, 'content', 'course.yaml'), 'schemaVersion: 2\n');
    const loader = withIntegrityCheck(innerLoader(), () => []);

    // Act and Assert
    await expect(loader.load(fakeContext(pathToFileURL(`${tempRoot}/`), []))).rejects.toThrow(/course\.yaml не пройшов валідацію/);
  });
});
