import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { ScormPackageKind } from './app/data.ts';

/**
 * Окрема Vite-збірка острова тренажера для пакета SCORM: ті самі React-компоненти й стилі сайту,
 * `base: './'`, один скрипт IIFE і один файл стилів без хешів у назвах. Жодних CDN: React і рушії
 * вшиваються в скрипт, шрифти й іконки додає збирач пакета.
 */

const APP_DIR = fileURLToPath(new URL('./app/', import.meta.url));

export interface ScormBundle {
  readonly script: Buffer;
  readonly styles: Buffer;
}

export async function buildScormBundle(kind: ScormPackageKind, outDir: string): Promise<ScormBundle> {
  await build({
    configFile: false,
    root: APP_DIR,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
    build: {
      outDir,
      emptyOutDir: true,
      copyPublicDir: false,
      sourcemap: false,
      reportCompressedSize: false,
      target: 'es2022',
      minify: true,
      lib: {
        entry: join(APP_DIR, `${kind}-entry.tsx`),
        formats: ['iife'],
        name: 'KuScormTrainer',
        fileName: () => 'app.js',
        cssFileName: 'app',
      },
    },
  });
  const [script, styles] = await Promise.all([readFile(join(outDir, 'app.js')), readFile(join(outDir, 'app.css'))]);
  return { script, styles };
}
