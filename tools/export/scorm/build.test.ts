import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NORMS } from '../../../src/components/trainers/norms.ts';
import { parseXml, type XmlNode } from '../test-support/xml-tree.ts';
import { readZip } from '../unzip.ts';
import type { ZipEntry } from '../zip.ts';
import { PACKAGE_DATA_ELEMENT_ID, parsePackageData } from './app/data.ts';
import { SCORM_INDEX_FILE, buildScormPackages, type ScormPackagesIndex } from './build.ts';
import { APP_SCRIPT, APP_STYLES } from './html.ts';
import { LAUNCH_FILE, MANIFEST_FILE } from './manifest.ts';

/**
 * Справжня збірка всіх пакетів SCORM (Vite + content/): структура ZIP і маніфесту, валідний XML,
 * відсутність абсолютних шляхів і зовнішніх ресурсів, дані острова, відтворюваність.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILD_TIMEOUT_MS = 180_000;

/** Ідентифікатори просторів імен і специфікацій, адреса декодера помилок React: рядки в коді, а не запити. */
const IDENTIFIER_URLS = [/^http:\/\/www\.w3\.org\//, /^https?:\/\/json-schema\.org\//, /^https:\/\/react\.dev\/errors\/$/, /^http:\/\/\[\$\{\w+\}\]$/];
const NORM_URLS = new Set(Object.values(NORMS).map((norm) => norm.url.replace(/#.*$/, '')));
const URL_IN_CODE = /https?:\/\/[^"'`\s)<>\\]+/g;
const NETWORK_API = /\bfetch\(|XMLHttpRequest|sendBeacon|importScripts|\bimport\(|new Worker\(|new EventSource\(|new WebSocket\(/;

let workspace: string;
let first: ScormPackagesIndex;
let second: ScormPackagesIndex;
const archives = new Map<string, ZipEntry[]>();

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ku-scorm-test-'));
  first = await buildScormPackages({ root: ROOT, outDir: join(workspace, 'first') });
  second = await buildScormPackages({ root: ROOT, outDir: join(workspace, 'second') });
  for (const entry of first.packages) archives.set(entry.id, readZip(await readFile(join(workspace, 'first', entry.file))));
}, BUILD_TIMEOUT_MS);

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function text(entries: readonly ZipEntry[], path: string): string {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`у пакеті немає ${path}`);
  return Buffer.from(entry.data).toString('utf8');
}

function find(node: XmlNode, name: string): XmlNode[] {
  return [...(node.name === name ? [node] : []), ...node.children.flatMap((childNode) => find(childNode, name))];
}

describe('scorm.json', () => {
  test('lists every package with size, hash and mastery score', async () => {
    // Arrange
    const onDisk = JSON.parse(await readFile(join(workspace, 'first', SCORM_INDEX_FILE), 'utf8')) as ScormPackagesIndex;

    // Assert
    expect(onDisk).toEqual(first);
    expect(first.packages.map((entry) => entry.file)).toEqual(['p01-matrytsia-modelei.zip', 'p03-kvorum.zip', 'p03-kumuliatyvne-holosuvannia.zip', 'p05-dyvidendy.zip']);
    for (const entry of first.packages) {
      const zip = await readFile(join(workspace, 'first', entry.file));
      expect(zip.length).toBe(entry.bytes);
      expect(entry.bytes).toBeLessThan(2 * 1024 * 1024);
      expect(entry.masteryPercent).toBe(entry.kind === 'matrix' ? 90 : 100);
    }
  });

  test('is reproducible byte for byte', () => {
    expect(second.packages.map((entry) => entry.sha256)).toEqual(first.packages.map((entry) => entry.sha256));
  });
});

describe.each(['p01-matrytsia-modelei', 'p03-kvorum', 'p03-kumuliatyvne-holosuvannia', 'p05-dyvidendy'])('package %s', (id) => {
  const entries = (): ZipEntry[] => archives.get(id) ?? [];
  const index = () => first.packages.find((entry) => entry.id === id);

  test('ZIP: manifest at the root first, launch page, bundle and fonts', () => {
    const paths = entries().map((entry) => entry.path);
    expect(paths[0]).toBe(MANIFEST_FILE);
    expect(paths).toEqual(expect.arrayContaining([LAUNCH_FILE, APP_SCRIPT, APP_STYLES, 'fonts/OFL.txt', 'fonts/OpenSans-Variable-cyrillic.woff2']));
    expect(paths.every((path) => !path.startsWith('/') && !path.includes('..') && !path.includes('\\'))).toBe(true);
    expect(index()?.files).toEqual(paths);
  });

  test('imsmanifest.xml is valid XML and lists exactly the files in the archive', () => {
    const root = parseXml(text(entries(), MANIFEST_FILE));
    const [resource] = find(root, 'resource');
    const listed = find(root, 'file').map((file) => file.attributes['href']);
    expect(resource?.attributes['href']).toBe(LAUNCH_FILE);
    expect(resource?.attributes['adlcp:scormtype']).toBe('sco');
    expect([...listed].sort()).toEqual(entries().map((entry) => entry.path).filter((path) => path !== MANIFEST_FILE).sort());
    expect(find(root, 'adlcp:masteryscore')[0]?.text).toBe(String(index()?.masteryPercent));
  });

  test('index.html loads only relative files that exist in the package', () => {
    const html = text(entries(), LAUNCH_FILE);
    const paths = new Set(entries().map((entry) => entry.path));
    const references = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g), ...html.matchAll(/url\("?([^")]+)"?\)/g)].map((match) => match[1] ?? '');
    expect(references.length).toBeGreaterThanOrEqual(10);
    for (const reference of references) {
      expect(reference, reference).toMatch(/^(\.\/|#)/);
      if (reference.startsWith('./')) expect(paths.has(reference.slice(2)), reference).toBe(true);
    }
    expect(html).toContain('<symbol id="i-check"');
  });

  test('styles and script have no absolute paths, CDNs or network calls', () => {
    const css = text(entries(), APP_STYLES);
    const js = text(entries(), APP_SCRIPT);
    expect(css).not.toMatch(/url\(|@import/);
    expect(js).not.toMatch(NETWORK_API);
    // У повідомленні — фрагменти навколо знахідок, а не початок мініфікованого скрипта.
    const absolutePaths = [...js.matchAll(/.{0,80}(?:\/_astro\/|\/korporatyvne-upravlinnia\/).{0,40}/g)].map((match) => match[0]);
    expect(absolutePaths).toEqual([]);
    // Відлагоджувальний JSX-рантайм вшиває абсолютні шляхи файлів збиральної машини — пакет має бути продакшен-збіркою.
    expect(js).not.toContain('jsxDEV');
    expect(js).not.toContain(ROOT);
    const urls = [...new Set(js.match(URL_IN_CODE) ?? [])];
    const unexpected = urls.filter((url) => !IDENTIFIER_URLS.some((pattern) => pattern.test(url)) && !NORM_URLS.has(url.replace(/#.*$/, '')));
    expect(unexpected).toEqual([]);
  });

  test('embedded island data matches the index; external URLs are only cited sources', () => {
    const html = text(entries(), LAUNCH_FILE);
    const match = new RegExp(`<script type="application/json" id="${PACKAGE_DATA_ELEMENT_ID}">([^<]*)</script>`).exec(html);
    const entry = index();
    if (!entry) throw new Error('немає запису індексу');
    const data = parsePackageData(match?.[1], entry.kind);
    expect(data.activityId).toBe(entry.activityId);
    expect(data.masteryPercent).toBe(entry.masteryPercent);
    const cited = data.kind === 'matrix' ? new Set(Object.values(data.sources).map((source) => source.url)) : new Set<string>();
    const dataUrls = (match?.[1] ?? '').match(URL_IN_CODE) ?? [];
    expect(dataUrls.filter((url) => !cited.has(url))).toEqual([]);
  });
});
