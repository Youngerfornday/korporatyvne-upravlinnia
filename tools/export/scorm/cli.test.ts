import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ScormPackagesIndex } from './build.ts';
import { runScormCli, type ScormBuilder } from './cli.ts';
import { spriteFromIconsAstro } from './html.ts';

const INDEX: ScormPackagesIndex = {
  schemaVersion: 1,
  generator: 'test',
  packages: [
    {
      id: 'p03-kvorum',
      file: 'p03-kvorum.zip',
      kind: 'quorum',
      title: 'П3. Тренажер «Кворум і голосування»',
      registryId: 'quorum',
      practical: 'p03',
      module: 'm2',
      activityId: 'quorum-calculator',
      masteryPercent: 100,
      bytes: 2048,
      sha256: '0'.repeat(64),
      files: ['imsmanifest.xml', 'index.html'],
    },
  ],
};

let workspace: string;
let out: string[];
let err: string[];
const io = { stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) };

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ku-scorm-cli-'));
  out = [];
  err = [];
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('runScormCli', () => {
  test('clears the output directory, builds and prints a summary', async () => {
    // Arrange
    const target = join(workspace, 'scorm');
    await mkdir(target);
    await writeFile(join(target, 'stale.zip'), 'old');
    let options: Parameters<ScormBuilder>[0] | undefined;
    const builder: ScormBuilder = async (received) => {
      options = received;
      return INDEX;
    };

    // Act
    const code = await runScormCli(['--out', 'scorm'], io, workspace, builder);

    // Assert
    expect(code).toBe(0);
    expect(options?.outDir).toBe(target);
    expect(existsSync(join(target, 'stale.zip'))).toBe(false);
    expect(out.join('\n')).toContain('p03-kvorum.zip');
    expect(out.join('\n')).toContain('прохідний 100');
  });

  test('reports a failed build with code 1', async () => {
    // Arrange
    const builder: ScormBuilder = async () => {
      throw new Error('Vite впав\nдругий рядок');
    };

    // Act
    const code = await runScormCli(['--out', 'scorm'], io, workspace, builder);

    // Assert
    expect(code).toBe(1);
    expect(err).toEqual(['Пакети SCORM не зібрано:', '  Vite впав', '  другий рядок']);
  });

  test('rejects unknown arguments with code 2 and prints help on --help', async () => {
    expect(await runScormCli(['--wat'], io, workspace)).toBe(2);
    expect(err.at(-1)).toMatch(/Використання/);
    expect(await runScormCli(['--help'], io, workspace)).toBe(0);
    expect(out.at(-1)).toMatch(/Використання/);
  });
});

describe('spriteFromIconsAstro', () => {
  test('strips the frontmatter and keeps the sprite', () => {
    expect(spriteFromIconsAstro('---\n/** doc */\n---\n\n<svg><symbol id="i-check"></symbol></svg>\n')).toBe('<svg><symbol id="i-check"></symbol></svg>');
  });

  test('fails loudly when the sprite changed shape', () => {
    expect(() => spriteFromIconsAstro('---\n---\n<div></div>')).toThrow(/спрайт іконок/);
  });
});
