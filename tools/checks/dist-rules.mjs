import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Маркер canary контрольних банків. Склеюється під час виконання, щоб цей файл сам не містив рядок цілком.
 * Має збігатися з CONTROL_CANARY_PREFIX у src/content/schemas/questions.ts (без кінцевого дефіса).
 */
export const CANARY_MARKER = ['KU', 'CONTROL', 'CANARY'].join('-');

const URL_ATTRIBUTE = /\s(href|src|srcset|action|formaction|poster|xlink:href)\s*=\s*(["'])(.*?)\2/gis;
const UNQUOTED_URL_ATTRIBUTE = /\s(href|src|action|formaction|poster|xlink:href)\s*=\s*([^\s"'`=<>]+)/gi;
const CSS_URL = /url\(\s*(["']?)(\/[^"')\s]*)\1\s*\)/gi;

/** '/korporatyvne-upravlinnia' → '/korporatyvne-upravlinnia/'; відсутній base → '/'. */
export function normalizeBase(base) {
  const trimmed = (base ?? '').replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

function isUnbased(value, base) {
  return value.startsWith('/') && !value.startsWith(base);
}

/**
 * Знаходить посилання від кореня домену без base: href="/…", src="/…", srcset, url(/…).
 * На GitHub Pages сайт живе в підкаталозі, тож такі посилання ведуть на чужий корінь youngerfornday.github.io.
 * @param {string} content
 * @param {string} base нормалізований base з кінцевою скісною рискою
 * @returns {{ attribute: string, value: string }[]}
 */
export function findUnbasedReferences(content, base) {
  const findings = [];
  for (const [, attribute, , value] of content.matchAll(URL_ATTRIBUTE)) {
    const name = attribute.toLowerCase();
    const candidates = name === 'srcset' ? value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '') : [value.trim()];
    for (const candidate of candidates) {
      if (isUnbased(candidate, base)) findings.push({ attribute: name, value: candidate });
    }
  }
  for (const [, attribute, value] of content.matchAll(UNQUOTED_URL_ATTRIBUTE)) {
    if (isUnbased(value, base)) findings.push({ attribute: attribute.toLowerCase(), value });
  }
  for (const [, , value] of content.matchAll(CSS_URL)) {
    if (isUnbased(value, base)) findings.push({ attribute: 'url()', value });
  }
  return findings;
}

/** @param {Buffer} buffer */
export function containsCanary(buffer) {
  return buffer.includes(CANARY_MARKER);
}

/**
 * Рекурсивний список файлів; символьні посилання не відвідуються.
 * @param {string} root
 * @param {ReadonlySet<string>} excludedDirectoryNames
 * @returns {string[]}
 */
export function listFilesRecursively(root, excludedDirectoryNames = new Set()) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return excludedDirectoryNames.has(entry.name) ? [] : listFilesRecursively(path, excludedDirectoryNames);
    }
    return entry.isFile() ? [path] : [];
  });
}
