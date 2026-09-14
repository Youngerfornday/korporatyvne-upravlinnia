import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANARY_MARKER,
  containsCanary,
  findUnbasedReferences,
  listFilesRecursively,
  normalizeBase,
} from './dist-rules.mjs';

const BASE = '/korporatyvne-upravlinnia/';

describe('normalizeBase', () => {
  it('adds leading and trailing slashes', () => {
    expect(normalizeBase('/korporatyvne-upravlinnia')).toBe(BASE);
    expect(normalizeBase('korporatyvne-upravlinnia/')).toBe(BASE);
    expect(normalizeBase(undefined)).toBe('/');
  });
});

describe('findUnbasedReferences', () => {
  it('accepts links and assets that carry the base, relative links and external URLs', () => {
    const html = [
      `<a href="${BASE}moduli/m1/">М1</a>`,
      `<script src="${BASE}_astro/app.js"></script>`,
      '<a href="#main">skip</a>',
      '<a href="https://zakon.rada.gov.ua/laws/show/2465-20">закон</a>',
      '<img src="data:image/png;base64,AAAA" alt="">',
      '<a href="../">вгору</a>',
    ].join('\n');
    expect(findUnbasedReferences(html, BASE)).toEqual([]);
  });

  it('reports href and src that start at the domain root without the base', () => {
    const html = `<a href="/moduli/m1/">М1</a><img src='/logo.svg' alt=""><link href="/_astro/a.css" rel="stylesheet">`;
    expect(findUnbasedReferences(html, BASE)).toEqual([
      { attribute: 'href', value: '/moduli/m1/' },
      { attribute: 'src', value: '/logo.svg' },
      { attribute: 'href', value: '/_astro/a.css' },
    ]);
  });

  it('reports protocol-relative URLs, srcset entries and CSS url() without the base', () => {
    const content = [
      '<script src="//cdn.example.com/x.js"></script>',
      `<img srcset="${BASE}a.png 1x, /b.png 2x" alt="">`,
      '.hero { background: url(/hero.webp) }',
      `.ok { background: url("${BASE}ok.webp") }`,
    ].join('\n');
    expect(findUnbasedReferences(content, BASE)).toEqual([
      { attribute: 'src', value: '//cdn.example.com/x.js' },
      { attribute: 'srcset', value: '/b.png' },
      { attribute: 'url()', value: '/hero.webp' },
    ]);
  });
});

describe('containsCanary', () => {
  it('detects the control canary marker in text and binary buffers', () => {
    expect(CANARY_MARKER.split('-')).toEqual(['KU', 'CONTROL', 'CANARY']);
    expect(containsCanary(Buffer.from(`canary: ${CANARY_MARKER}-m1-2026`))).toBe(true);
    expect(containsCanary(Buffer.from([0, 255, ...Buffer.from(CANARY_MARKER), 0]))).toBe(true);
    expect(containsCanary(Buffer.from('KU-CONTROL canary'))).toBe(false);
  });
});

describe('listFilesRecursively', () => {
  let root;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it('lists nested files and skips excluded directory names', () => {
    root = mkdtempSync(join(tmpdir(), 'ku-dist-rules-'));
    mkdirSync(join(root, 'a', 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(root, '.git'), { recursive: true });
    writeFileSync(join(root, 'a', 'one.html'), '');
    writeFileSync(join(root, 'a', 'node_modules', 'pkg', 'index.js'), '');
    writeFileSync(join(root, '.git', 'HEAD'), '');
    writeFileSync(join(root, 'two.css'), '');

    const files = listFilesRecursively(root, new Set(['node_modules', '.git']))
      .map((file) => file.slice(root.length + 1))
      .sort();

    expect(files).toEqual([join('a', 'one.html'), 'two.css']);
  });
});
