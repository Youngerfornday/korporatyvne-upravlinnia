import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR, makeFinding } from '../finding.mjs';

export const RULE = 'svg-safety';
const FIGURE_PATH = /(?:^|\/)content\/modules\/[^/]+\/[^/]+\/(fig-[^/]+\.svg)$/u;
const TOPIC_PATH = /^(content\/modules\/[^/]+\/[^/]+)\//u;
const HINT = 'Приберіть виконуваний, зовнішній або вбудований HTML-контент зі схеми SVG.';

const FORBIDDEN = [
  { marker: '<script', pattern: /<script\b/iu },
  { marker: '<foreignObject', pattern: /<foreignObject\b/iu },
  { marker: 'on*', pattern: /\bon[a-z][\w:-]*\s*=/iu },
  { marker: 'http(s):// або javascript:', pattern: /(?:href|xlink:href)\s*=\s*['"]?\s*(?:https?:\/\/|javascript:)/iu },
  { marker: '<iframe', pattern: /<iframe\b/iu },
  { marker: '<object', pattern: /<object\b/iu },
  { marker: '<embed', pattern: /<embed\b/iu },
];

function directFigureFiles(files) {
  return files.filter((file) => FIGURE_PATH.test(file.file));
}

function discoveredFigureFiles(files) {
  const directories = new Set(files.map((file) => TOPIC_PATH.exec(file.file)?.[1]).filter(Boolean));
  return [...directories].flatMap((directory) => {
    try {
      return readdirSync(resolve(directory), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^fig-[^/]+\.svg$/u.test(entry.name))
        .map((entry) => {
          const file = `${directory}/${entry.name}`;
          const text = readFileSync(resolve(file), 'utf8');
          return { file, text, lines: text.split(/\r?\n/u) };
        });
    } catch {
      return [];
    }
  });
}

/** @param {{ file: string, text: string, lines: string[] }[]} files */
export function checkSvgSafety(files) {
  const candidates = new Map([...directFigureFiles(files), ...discoveredFigureFiles(files)].map((file) => [file.file, file]));
  return [...candidates.values()].flatMap((file) => file.lines.flatMap((lineText, index) => {
    const violations = FORBIDDEN.filter(({ pattern }) => pattern.test(lineText));
    return violations.map(({ marker }) => makeFinding({
      file: file.file,
      line: index + 1,
      rule: RULE,
      level: ERROR,
      message: `SVG-схема містить заборонений елемент або атрибут ${marker}`,
      hint: HINT,
      quote: lineText.trim(),
    }));
  }));
}
