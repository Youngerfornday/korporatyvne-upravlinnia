import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTROL_CANARY_PREFIX } from '../../src/content/schemas/questions.ts';
import { runCli, type CliIo } from './cli.ts';
import type { ExportManifest } from './export-files.ts';
import { examples } from './test-support/banks.ts';
import { parseXml } from './test-support/xml-tree.ts';

/**
 * CLI перевіряється на фікстурах tools/export/__fixtures__ і на реальному реєстрі content/course.yaml —
 * тому тести не залежать від конкретних формулювань, лише від складу файлів і кодів виходу.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES = join(ROOT, 'tools/export/__fixtures__');
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temporaryDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ku-export-'));
  temporary.push(dir);
  return dir;
}

function collectingIo(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (line) => out.push(line), stderr: (line) => err.push(line) }, out, err };
}

async function run(args: readonly string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const { io, out, err } = collectingIo();
  const code = await runCli(args, io, ROOT);
  return { code, out, err };
}

async function runOnFixtures(outDir: string, extra: readonly string[] = []) {
  return run(['--banks', `${FIXTURES}/banks`, '--modules', `${FIXTURES}/modules`, '--out', outDir, ...extra]);
}

async function bankDir(bank: unknown, name = 'm1.yaml'): Promise<string> {
  const dir = join(await temporaryDir(), 'banks');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), stringify(bank), 'utf8');
  return dir;
}

describe('runCli: успішний експорт', () => {
  it('пише файли на модуль і на курс, глосарії та маніфест', async () => {
    const outDir = await temporaryDir();
    const { code, out } = await runOnFixtures(outDir);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^Moodle XML: 9 файлів/);
    expect((await readdir(outDir)).sort()).toEqual([
      'glossary-course.xml',
      'glossary-m1.xml',
      'glossary-m2.xml',
      'glossary-m3.xml',
      'manifest.json',
      'questions-training-course.xml',
      'questions-training-m1.xml',
      'questions-training-m2.xml',
      'questions-training-m3.xml',
    ]);
    for (const name of await readdir(outDir)) {
      const contents = await readFile(join(outDir, name), 'utf8');
      if (name.endsWith('.xml')) expect(() => parseXml(contents)).not.toThrow();
    }
  });

  it('маніфест описує очікуваний стан Moodle для кожного файлу', async () => {
    const outDir = await temporaryDir();
    await runOnFixtures(outDir);
    const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')) as ExportManifest;
    const course = manifest.questions.find((entry) => entry.scope === 'course');
    expect(course?.total).toBe(12);
    expect(course?.byType).toEqual({ calculated: 2, ddwtos: 1, match: 1, multianswer: 2, multichoice: 3, numerical: 1, truefalse: 2 });
    expect(manifest.questions.map((entry) => entry.scope)).toEqual(['m1', 'm2', 'm3', 'course']);
    expect(manifest.questions.every((entry) => entry.kind === 'training')).toBe(true);
    expect(manifest.glossaries.map((entry) => entry.total)).toEqual([3, 2, 1, 6]);
    expect(manifest.glossaries.at(-1)?.categories).toHaveLength(3);
  });

  it('видаляє застарілі файли експорту, але не чіпає чужі', async () => {
    const outDir = await temporaryDir();
    await writeFile(join(outDir, 'questions-training-m9.xml'), 'старий', 'utf8');
    await writeFile(join(outDir, 'README.md'), 'чужий файл', 'utf8');
    await runOnFixtures(outDir);
    const files = await readdir(outDir);
    expect(files).not.toContain('questions-training-m9.xml');
    expect(files).toContain('README.md');
  });

  it('контрольний банк: файли з префіксом control і жодного canary у виводі', async () => {
    const canary = `${CONTROL_CANARY_PREFIX}m2-cli`;
    const banks = await bankDir(
      { schemaVersion: 1, kind: 'control', module: 'm2', canary, questions: [examples.multichoiceSingle()] },
      'm2.yaml',
    );
    const outDir = await temporaryDir();
    const { code } = await run(['--banks', banks, '--modules', `${FIXTURES}/modules`, '--out', outDir]);
    expect(code).toBe(0);
    const names = await readdir(outDir);
    expect(names).toContain('questions-control-m2.xml');
    expect(names).toContain('questions-control-course.xml');
    for (const name of names) {
      expect(await readFile(join(outDir, name), 'utf8')).not.toContain(CONTROL_CANARY_PREFIX);
    }
  });
});

describe('runCli: звіт про помилки', () => {
  it('помилка схеми банку зупиняє експорт українською й нічого не пише', async () => {
    const broken = {
      schemaVersion: 1,
      kind: 'training',
      module: 'm2',
      questions: [{ ...examples.multichoiceSingle(), answers: examples.multichoiceSingle().answers.map((answer) => ({ ...answer, fraction: 0 })) }],
    };
    const outDir = await temporaryDir();
    const { code, err } = await run(['--banks', await bankDir(broken, 'm2.yaml'), '--modules', `${FIXTURES}/modules`, '--out', outDir]);
    expect(code).toBe(1);
    expect(err[0]).toBe('Експорт у Moodle XML зупинено: знайдено 1 помилку.');
    expect(err[1]).toContain('В одиночному виборі має бути рівно одна відповідь зі 100%');
    expect(await readdir(outDir)).toEqual([]);
  });

  it('некоректний YAML і відсутній каталог банків', async () => {
    const dir = join(await temporaryDir(), 'banks');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'm1.yaml'), 'kind: [training', 'utf8');
    const broken = await run(['--banks', dir, '--modules', `${FIXTURES}/modules`, '--out', await temporaryDir()]);
    expect(broken.code).toBe(1);
    expect(broken.err.join('\n')).toContain('YAML некоректний');

    const missing = await run(['--banks', join(dir, 'немає'), '--modules', `${FIXTURES}/modules`, '--out', await temporaryDir()]);
    expect(missing.code).toBe(1);
    expect(missing.err.join('\n')).toContain('каталог банків питань не знайдено');
  });

  it('питання з теми чужого модуля', async () => {
    const banks = await bankDir({ schemaVersion: 1, kind: 'training', module: 'm1', questions: [examples.multichoiceSingle()] });
    const { code, err } = await run(['--banks', banks, '--modules', `${FIXTURES}/modules`, '--out', await temporaryDir()]);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('належить модулю m2, а банк — модулю m1');
  });

  it('контрольний банк у каталозі тренувальних', async () => {
    const dir = join(await temporaryDir(), 'banks', 'training');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'm2.yaml'),
      stringify({
        schemaVersion: 1,
        kind: 'control',
        module: 'm2',
        canary: `${CONTROL_CANARY_PREFIX}m2-dir`,
        questions: [examples.multichoiceSingle()],
      }),
      'utf8',
    );
    const { code, err } = await run(['--banks', dir, '--modules', `${FIXTURES}/modules`, '--out', await temporaryDir()]);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('контрольний банк лежить у каталозі тренувальних банків');
  });

  it('помилка генерації (логарифмічний набір даних із нулем) потрапляє у звіт', async () => {
    const calculated = examples.calculated();
    const banks = await bankDir({
      schemaVersion: 1,
      kind: 'training',
      module: 'm3',
      questions: [
        {
          ...calculated,
          datasets: [...calculated.datasets.slice(0, 2), { name: 'n', min: 0, max: 20, decimals: 0, distribution: 'loguniform' }],
        },
      ],
    });
    const { code, err } = await run(['--banks', banks, '--modules', `${FIXTURES}/modules`, '--out', await temporaryDir()]);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('логарифмічний розподіл потребує додатних min і max');
  });

  it('невідомий параметр — код 2 з підказкою, --help — код 0', async () => {
    const unknown = await run(['--невідомий']);
    expect(unknown.code).toBe(2);
    expect(unknown.err.at(-1)).toContain('Використання:');

    const help = await run(['--help']);
    expect(help.code).toBe(0);
    expect(help.out.join('\n')).toContain('--banks');
  });
});
