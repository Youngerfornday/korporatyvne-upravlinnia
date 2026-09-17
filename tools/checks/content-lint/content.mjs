/**
 * Модель файлів content/ для лінту: рядкові значення YAML і абзаци MDX з номерами рядків.
 * Кожна «одиниця» (unit) знає своє оточення (мапу YAML або абзац MDX) — правила про «в межах абзацу»
 * перевіряють маркери саме в ньому.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { LineCounter, isMap, isPair, isScalar, parseDocument } from 'yaml';
import { normalizeText } from './text.mjs';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** @typedef {{ line: number, endLine: number, key: string|null, path: string[], text: string, container: string, containerLine: number, record: string }} Unit */
/** @typedef {{ line: number, endLine: number, path: string[], keys: Record<string, unknown>, text: string }} MapNode */
/** @typedef {{ file: string, kind: 'yaml'|'mdx', text: string, lines: string[], units: Unit[], maps: MapNode[], data: unknown }} ContentFile */

function keyPath(path) {
  return path.filter((node) => isPair(node) && isScalar(node.key)).map((node) => String(node.key.value));
}

/**
 * Рядкові скаляри YAML з номерами рядків і мапами, у яких вони лежать.
 * @param {string} text
 * @param {number} lineOffset зсув для frontmatter MDX
 */
export function yamlModel(text, lineOffset = 0) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const units = [];
  const maps = [];
  const records = new Map();
  const lineAt = (offset) => lineCounter.linePos(offset).line + lineOffset;

  visitDocument(doc, {
    map(node, path) {
      if (!node.range) return;
      const [start, , end] = node.range;
      const record = {
        line: lineAt(start),
        endLine: lineAt(Math.max(start, end - 1)),
        path: keyPath(path),
        keys: Object.fromEntries(node.items.filter((item) => isScalar(item.key)).map((item) => [String(item.key.value), isScalar(item.value) ? item.value.value : null])),
        text: text.slice(start, end),
      };
      records.set(node, record);
      maps.push(record);
    },
    scalar(node, key, path) {
      if (typeof node.value !== 'string' || !node.range || key === 'key') return;
      const parent = path.at(-1);
      const field = isPair(parent) && key === 'value' && isScalar(parent.key) ? String(parent.key.value) : null;
      const ancestors = path.filter((item) => isMap(item) && records.has(item)).map((item) => records.get(item));
      const innermost = ancestors.at(-1);
      // «Запис» — найближчий до кореня елемент верхньої послідовності (питання, кейс, тема):
      // саме в ньому живуть lawRef і source, тож маркери джерела шукаються в його межах.
      const outer = ancestors.find((item) => item.path.length > 0) ?? innermost;
      units.push({
        line: lineAt(node.range[0]),
        endLine: lineAt(Math.max(node.range[0], node.range[1] - 1)),
        key: field,
        path: keyPath(path),
        text: normalizeText(node.value),
        container: innermost?.text ?? text,
        containerLine: innermost?.line ?? 1,
        record: outer?.text ?? innermost?.text ?? text,
      });
    },
  });
  return { units, maps, data: doc.toJS({ maxAliasCount: -1 }) };
}

/** Обхід документа yaml без залежності від сигнатури visit(): достатньо мап, пар і скалярів. */
function visitDocument(doc, handlers) {
  const walk = (node, key, path) => {
    if (isMap(node)) {
      handlers.map(node, path);
      for (const item of node.items) walk(item, null, [...path, node]);
      return;
    }
    if (isPair(node)) {
      walk(node.key, 'key', [...path, node]);
      walk(node.value, 'value', [...path, node]);
      return;
    }
    if (isScalar(node)) {
      handlers.scalar(node, key, path);
      return;
    }
    if (node && Array.isArray(node.items)) {
      for (const item of node.items) walk(item, null, [...path, node]);
    }
  };
  walk(doc.contents, null, []);
}

/** Абзаци MDX: суцільні блоки непорожніх рядків (один <p> — один рядок у цьому курсі). */
export function mdxBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let start = -1;
  lines.forEach((line, index) => {
    const isBlank = line.trim() === '';
    if (!isBlank && start < 0) start = index;
    if (isBlank && start >= 0) {
      blocks.push({ line: start + 1, endLine: index, text: lines.slice(start, index).join('\n') });
      start = -1;
    }
  });
  if (start >= 0) blocks.push({ line: start + 1, endLine: lines.length, text: lines.slice(start).join('\n') });
  return blocks;
}

/** MDX: frontmatter як YAML плюс кожен рядок тіла як одиниця з абзацом-оточенням. */
export function mdxModel(text) {
  const frontmatter = FRONTMATTER.exec(text);
  const front = frontmatter ? yamlModel(frontmatter[1], 1) : { units: [], maps: [], data: {} };
  const bodyStart = frontmatter ? (frontmatter[0].match(/\r?\n/g) ?? []).length : 0;
  const lines = text.split(/\r?\n/);
  const body = frontmatter ? text.slice(frontmatter[0].length) : text;
  const blocks = mdxBlocks(body).map((block) => ({ ...block, line: block.line + bodyStart, endLine: block.endLine + bodyStart }));
  const units = blocks.flatMap((block) =>
    block.text.split(/\r?\n/).map((line, index) => ({
      line: block.line + index,
      endLine: block.line + index,
      key: null,
      path: [],
      text: normalizeText(line),
      container: block.text,
      containerLine: block.line,
      record: block.text,
    })),
  ).filter((unit) => unit.text !== '');
  return { units: [...front.units, ...units], maps: front.maps, data: front.data, lines, blocks };
}

const SLIDES_FILE = /(?:^|\/)modules\/m\d+\/t\d{2}\/slides\.ya?ml$/;

/** Презентація теми: `content/modules/mN/tNN/slides.yaml`. */
export function isSlidesFile(file) {
  return SLIDES_FILE.test(file.file);
}

/** @returns {ContentFile} */
export function contentFile(file, text) {
  const kind = extname(file) === '.mdx' || extname(file) === '.md' ? 'mdx' : 'yaml';
  const model = kind === 'mdx' ? mdxModel(text) : yamlModel(text);
  return { file, kind, text, lines: text.split(/\r?\n/), units: model.units, maps: model.maps, data: model.data };
}

export function readContentFile(root, relativePath) {
  return contentFile(relativePath, readFileSync(new URL(relativePath, root), 'utf8'));
}

/**
 * Точний рядок згадки всередині багаторядкового скаляра.
 * YAML-скаляр `>-` займає кілька рядків, і посилатися на його перший рядок — неточно.
 */
export function refineLine(file, unit, needle) {
  const target = normalizeText(needle).toLocaleLowerCase('uk-UA');
  for (let line = unit.line; line <= Math.min(unit.endLine, file.lines.length); line += 1) {
    if (normalizeText(file.lines[line - 1] ?? '').toLocaleLowerCase('uk-UA').includes(target)) return line;
  }
  return unit.line;
}
