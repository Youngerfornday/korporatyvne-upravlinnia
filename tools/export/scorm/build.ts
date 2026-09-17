import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CourseSchema, type Course } from '../../../src/content/schemas/course.ts';
import { loadPracticals, parseDataFile } from '../downloads-sources.ts';
import { createZip, type ZipEntry } from '../zip.ts';
import { buildScormBundle, type ScormBundle } from './bundle.ts';
import { scormPackageSpecs, type ScormPackageSpec } from './catalog.ts';
import { APP_SCRIPT, APP_STYLES, packageHtml, spriteFromIconsAstro } from './html.ts';
import { LAUNCH_FILE, MANIFEST_FILE, scormManifestXml } from './manifest.ts';
import type { ScormPackageKind } from './app/data.ts';

/**
 * Пакети SCORM 1.2 тренажерів: Vite-збірка острова → index.html з даними → шрифти сайту → imsmanifest.xml
 * з переліком усіх файлів → відтворюваний ZIP. Поруч пишеться `scorm.json` — індекс для конвеєра матеріалів
 * і плану курсу Moodle.
 */

export const SCORM_INDEX_FILE = 'scorm.json';
const FONT_FILE = /^OpenSans-.*\.woff2$|^OFL\.txt$/;

export interface ScormPackageEntry {
  readonly id: string;
  readonly file: string;
  readonly kind: ScormPackageKind;
  readonly title: string;
  readonly registryId: string;
  readonly practical: string;
  readonly module: string;
  readonly activityId: string;
  readonly masteryPercent: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly files: readonly string[];
}

export interface ScormPackagesIndex {
  readonly schemaVersion: 1;
  readonly generator: string;
  readonly packages: readonly ScormPackageEntry[];
}

export type BundleBuilder = (kind: ScormPackageKind, outDir: string) => Promise<ScormBundle>;

export interface BuildScormOptions {
  readonly root: string;
  readonly outDir: string;
  readonly bundle?: BundleBuilder;
}

interface PackageAssets {
  readonly course: Course;
  readonly sprite: string;
  readonly fonts: readonly ZipEntry[];
}

async function loadAssets(root: string): Promise<{ assets: PackageAssets; specs: ScormPackageSpec[] }> {
  const course = await parseDataFile(join(root, 'content/course.yaml'), CourseSchema);
  const practicals = await loadPracticals(join(root, 'content/practicals'), course);
  const sprite = spriteFromIconsAstro(await readFile(join(root, 'src/components/site/Icons.astro'), 'utf8'));
  const fontDir = join(root, 'public/fonts');
  const fontNames = (await readdir(fontDir)).filter((name) => FONT_FILE.test(name)).sort();
  if (!fontNames.some((name) => name.endsWith('.woff2'))) throw new Error(`У ${fontDir} немає шрифтів сайту`);
  const fonts = await Promise.all(fontNames.map(async (name) => ({ path: `fonts/${name}`, data: await readFile(join(fontDir, name)) })));
  return { assets: { course, sprite, fonts }, specs: scormPackageSpecs(course, practicals) };
}

/** Записи архіву пакета: маніфест першим, далі сторінка запуску, збірка острова й шрифти. */
export function packageEntries(spec: ScormPackageSpec, assets: PackageAssets, bundle: ScormBundle): ZipEntry[] {
  const content: ZipEntry[] = [
    { path: LAUNCH_FILE, data: Buffer.from(packageHtml({ spec, courseTitle: assets.course.title, sprite: assets.sprite }), 'utf8') },
    { path: APP_SCRIPT, data: bundle.script },
    { path: APP_STYLES, data: bundle.styles },
    ...assets.fonts,
  ];
  const manifest = scormManifestXml({
    id: spec.id,
    title: spec.title,
    organizationTitle: assets.course.title,
    masteryPercent: spec.masteryPercent,
    files: content.map((entry) => entry.path),
  });
  return [{ path: MANIFEST_FILE, data: Buffer.from(manifest, 'utf8') }, ...content];
}

export async function buildScormPackages(options: BuildScormOptions): Promise<ScormPackagesIndex> {
  const bundle = options.bundle ?? buildScormBundle;
  const { assets, specs } = await loadAssets(options.root);
  const workDir = await mkdtemp(join(tmpdir(), 'ku-scorm-'));
  try {
    await mkdir(options.outDir, { recursive: true });
    const packages: ScormPackageEntry[] = [];
    // Послідовно: паралельні збірки Vite в одному процесі змагаються за спільний кеш і не прискорюють роботу.
    for (const spec of specs) {
      const built = await bundle(spec.kind, join(workDir, spec.id));
      const entries = packageEntries(spec, assets, built);
      const zip = createZip(entries);
      const file = `${spec.id}.zip`;
      await writeFile(join(options.outDir, file), zip);
      packages.push({
        id: spec.id,
        file,
        kind: spec.kind,
        title: spec.title,
        registryId: spec.registryId,
        practical: spec.practicalId,
        module: spec.module,
        activityId: spec.data.activityId,
        masteryPercent: spec.masteryPercent,
        bytes: zip.length,
        sha256: createHash('sha256').update(zip).digest('hex'),
        files: entries.map((entry) => entry.path),
      });
    }
    const index: ScormPackagesIndex = { schemaVersion: 1, generator: 'tools/export/scorm/build.ts', packages };
    await writeFile(join(options.outDir, SCORM_INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    return index;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
