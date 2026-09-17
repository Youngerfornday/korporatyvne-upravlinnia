/**
 * Розбір docs/research/legal-baseline.md — єдиного джерела норм для курсу.
 * Витягує: номери законів, коди рядків зі статтями й датами перевірки, розділ «Не підтверджено».
 * Формат документа описано в його розділі «Правила використання»; парсер тримається саме цих домовленостей.
 */
import { normalizeText, signatureStems } from './text.mjs';

const BASE_DATE = /Дата перевірки:\s*\*\*(\d{4}-\d{2}-\d{2})\*\*/;
const SECTION = /^##\s+(.+?)\s*$/;
const SECTION_CHECKED = /^Перевірено\s+(\d{4}-\d{2}-\d{2})/i;
const INLINE_CHECKED = /перевірено\s+(\d{4}-\d{2}-\d{2})/i;
const CODE_ROW = /^\|\s*\[([A-Z][A-Z0-9-]*-\d{2})\]\s*([^|]*)\|([^|]*)\|/;
const UNCONFIRMED_ITEM = /^(\d+)\.\s+\*\*(.+?)\*\*(.*)$/;
const KEY_NUMBERS_HEADING = 'Ключові числа';
const UNCONFIRMED_HEADING = 'Не підтверджено';

/** Номер акта: 2465-IX, 448/96-ВР, 8073-X. Картки актів (514-17) сюди не потрапляють — після дефіса лише літери. */
export const LAW_NUMBER = /\b(\d{1,5}(?:\/\d{1,4})?-[IVXLCDMА-ЯҐЄІЇ]{1,6})\b/gu;
/** Згадка акта в контенті: лише з «№», щоб DOI й номери звітів не вважалися законами. */
export const LAW_MENTION = /№\s*(\d{1,5}(?:\/\d{1,4})?-[IVXLCDMА-ЯҐЄІЇ]{1,6})\b/gu;
/** Адреси прибираються перед пошуком: у них трапляються схожі на номери актів шматки. */
export const URL_IN_TEXT = /https?:\/\/\S+/g;
/** Код рядка бази: AT-01, ESG-UA-03, MZP-01. */
export const CODE_TOKEN = /\b([A-Z]{2,4}(?:-[A-Z]{2})?-\d{2})\b/g;

/** Номери статей у рядку: «ст. 107 ч. 1–3, 15 п. 1» → {107}; «ст. 5-1 ч. 4» → {5-1}. */
export function articleNumbers(text) {
  const found = new Set();
  for (const [, number] of normalizeText(text).matchAll(/ст\.\s*(\d{1,3}(?:-\d{1,2})?)/g)) found.add(number);
  return found;
}

export function lawNumbers(text) {
  return [...normalizeText(text).matchAll(LAW_NUMBER)].map(([, number]) => number.toUpperCase());
}

function splitRow(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function addCode(codes, code, patch) {
  const current = codes.get(code) ?? { code, line: patch.line ?? 0, name: '', article: '', articles: new Set(), dates: new Set(), section: '', row: '' };
  const merged = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined && !(value instanceof Set))),
    articles: new Set([...current.articles, ...(patch.articles ?? [])]),
    dates: new Set([...current.dates, ...(patch.dates ?? [])]),
  };
  codes.set(code, merged);
}

/**
 * @param {string} text вміст legal-baseline.md
 * @returns {{
 *   baseDate: string,
 *   laws: Map<string, { confirmed: boolean, line: number }>,
 *   codes: Map<string, { code: string, line: number, name: string, article: string, articles: Set<string>, dates: Set<string>, section: string, row: string }>,
 *   unconfirmed: Array<{ number: number, line: number, title: string, text: string, stems: string[], laws: string[] }>,
 * }}
 */
export function parseBaseline(text) {
  const lines = text.split(/\r?\n/);
  const baseDate = BASE_DATE.exec(text)?.[1] ?? '';
  const codes = new Map();
  const laws = new Map();
  const unconfirmed = [];
  const sectionDates = new Map();
  let section = '';
  let inKeyNumbers = false;
  let inUnconfirmed = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = SECTION.exec(line);
    if (heading) {
      section = heading[1];
      inKeyNumbers = section.startsWith(KEY_NUMBERS_HEADING);
      inUnconfirmed = section.startsWith(UNCONFIRMED_HEADING);
    }
    const sectionChecked = SECTION_CHECKED.exec(line.trim());
    if (sectionChecked) sectionDates.set(section, sectionChecked[1]);

    for (const number of lawNumbers(line)) {
      const known = laws.get(number);
      if (!known) laws.set(number, { confirmed: !inUnconfirmed, line: lineNumber });
      else if (!known.confirmed && !inUnconfirmed) laws.set(number, { confirmed: true, line: lineNumber });
    }

    const codeRow = CODE_ROW.exec(line);
    if (codeRow) {
      const [, code, name, article] = codeRow;
      addCode(codes, code, {
        line: lineNumber,
        name: name.trim(),
        article: article.trim(),
        articles: articleNumbers(article),
        section,
        row: line,
        dates: INLINE_CHECKED.test(line) ? [INLINE_CHECKED.exec(line)[1]] : [],
      });
    }

    if (inKeyNumbers && line.startsWith('|')) {
      const cells = splitRow(line);
      const KEY_ROW_CELLS = 7;
      if (cells.length >= KEY_ROW_CELLS && /^\d{4}-\d{2}-\d{2}$/.test(cells[6])) {
        for (const [, code] of cells[4].matchAll(CODE_TOKEN)) {
          addCode(codes, code, { articles: articleNumbers(cells[2]), dates: [cells[6]] });
        }
      }
    }

    if (inUnconfirmed) {
      const item = UNCONFIRMED_ITEM.exec(line.trim());
      if (item) {
        const [, number, title, rest] = item;
        unconfirmed.push({
          number: Number(number),
          line: lineNumber,
          title: title.replace(/[.,;:]\s*$/, ''),
          text: normalizeText(`${title} ${rest}`),
          stems: signatureStems(title),
          laws: [...new Set(lawNumbers(`${title} ${rest}`))],
        });
      }
    }
  });

  for (const [code, entry] of codes) {
    if (entry.dates.size === 0) {
      const sectionDate = sectionDates.get(entry.section);
      codes.set(code, { ...entry, dates: new Set([sectionDate ?? baseDate]) });
    }
  }
  return { baseDate, laws, codes, unconfirmed };
}

/** Дати, дозволені для коду: колонка «Перевірено», інакше дата рядка/розділу, інакше базова дата документа. */
export function expectedDates(baseline, code) {
  return baseline.codes.get(code)?.dates ?? new Set([baseline.baseDate]);
}
