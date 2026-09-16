/**
 * Українська типографіка для тексту курсу. Чиста функція без залежностей: її використовують
 * hast-плагін для MDX (сайт), лінт контенту (tools/checks/typography-lint.mjs) і майбутні експортери.
 *
 * Файл навмисно без TypeScript-синтаксису, який Node не вміє стирати (enum, namespace, parameter properties):
 * лінт запускається через `node` без збірки.
 */

export const NBSP = ' ';
export const APOSTROPHE = '’';
export const EM_DASH = '—';
export const EN_DASH = '–';

const CYRILLIC = 'А-ЯІЇЄҐа-яіїєґ';
/** Слова з однієї літери, після яких у рядок ставиться нерозривний пробіл. */
const ONE_LETTER_WORDS = 'АІЙУВЗОаійувзо';
const UNITS = ['р\\.', 'рр\\.', 'ст\\.', 'год', 'хв', 'грн', 'тис\\.', 'млн', 'млрд', 'XP', 'млн\\.'];
/** Лексеми, які не чіпаємо: адреси, e-mail. */
const PROTECTED = /(?:https?:\/\/|www\.)[^\s«»„“”"<>]+|[\w.+-]+@[\w-]+\.[\w.-]+/g;

export interface NormalizeOptions {
  /** Ставити нерозривні пробіли. Вимикається для заголовків, що стають якорями. */
  readonly nbsp?: boolean;
}

export interface TextPart {
  readonly text: string;
  readonly protected: boolean;
}

/** Ділить рядок на захищені лексеми (URL, e-mail) і звичайний текст, зберігаючи порядок. */
export function splitProtected(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(PROTECTED)) {
    const index = match.index;
    if (index > last) parts.push({ text: text.slice(last, index), protected: false });
    parts.push({ text: match[0], protected: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), protected: false });
  return parts;
}

function fixApostrophes(text: string): string {
  return text.replace(new RegExp(`(?<=[${CYRILLIC}])['ʼ\`´‘’](?=[${CYRILLIC}])`, 'g'), APOSTROPHE);
}

const OPENS_AFTER = new Set([' ', NBSP, '\n', '\t', '(', '[', '«', '„', EM_DASH, EN_DASH, '-', '/']);

/**
 * Прямі й англійські лапки → «» на першому рівні та „“ на другому.
 * Відкривна лапка — на початку рядка або після пробілу/дужки/тире; інакше — закривна.
 * Наявні «» і „“ теж рахуються, щоб не зламати вкладеність уже правильного тексту.
 */
function fixQuotes(text: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    const prev = i === 0 ? ' ' : (text[i - 1] as string);
    if (ch === '«' || ch === '„') {
      depth += 1;
      out += ch;
    } else if (ch === '»') {
      depth = Math.max(0, depth - 1);
      out += ch;
    } else if (ch === '“' && !OPENS_AFTER.has(prev)) {
      // „…“ — закривна лапка другого рівня; після пробілу той самий символ — англійська відкривна
      depth = Math.max(0, depth - 1);
      out += ch;
    } else if (ch === '"' || ch === '”' || ch === '“') {
      const opening = ch === '”' ? false : OPENS_AFTER.has(prev);
      if (opening) {
        out += depth === 0 ? '«' : '„';
        depth += 1;
      } else {
        depth = Math.max(0, depth - 1);
        out += depth === 0 ? '»' : '“';
      }
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Числовий діапазон — лексема лише з цифр, ком, крапок і % з рівно одним дефісом (2020-2026, 10-25%, 1,5-2).
 * Не діапазон: ISO-дати й ISBN (два й більше дефісів), коди з літерами чи «/» (2465-IX, z1307-23, 448/96-ВР, шляхи),
 * а також номери пунктів і статей після п., ст., ч., абз., № (п. 2-1).
 */
const NUMERIC_RANGE = /(?<![^\s(«„])(\d[\d,.]*)-(\d[\d,.%]*)(?![^\s)»“.,;:!?])/g;
const ITEM_NUMBER_BEFORE = new RegExp(`(?:№|(?<![${CYRILLIC}])(?:п|ст|ч|абз|розд)\\.)[ ${NBSP}]*$`);

function fixNumericRanges(text: string): string {
  return text.replace(NUMERIC_RANGE, (match, from: string, to: string, offset: number) =>
    ITEM_NUMBER_BEFORE.test(text.slice(0, offset)) ? match : `${from}${EN_DASH}${to}`,
  );
}

function fixDashes(text: string): string {
  return (
    text
      // « - », « – », « — », « -- » → нерозривний пробіл, тире, пробіл
      .replace(new RegExp(`[ ${NBSP}]+(?:--|[-${EN_DASH}${EM_DASH}])[ ${NBSP}]+`, 'g'), `${NBSP}${EM_DASH} `)
      .replace(/\.{3}/g, '…')
  );
}

function fixSpaces(text: string): string {
  const sp = `[ ${NBSP}]`;
  return (
    text
      // № 5, ст. 3, п. 2, ч. 1, абз. 4
      .replace(new RegExp(`(№|(?<![${CYRILLIC}])(?:ст|п|ч|с|абз|розд)\\.)${sp}+(?=\\d)`, 'g'), `$1${NBSP}`)
      // однолітерні прийменники й сполучники: «у товаристві», «і збори»; lookbehind, бо слова можуть іти підряд («а в»)
      .replace(new RegExp(`(?<=^|[\\s(«„${EM_DASH}])([${ONE_LETTER_WORDS}])${sp}+(?=\\S)`, 'gm'), `$1${NBSP}`)
      // число + одиниця: 120 год, 2023 р., 48,7 %
      .replace(new RegExp(`(\\d)${sp}+(?=(?:${UNITS.join('|')}|%)(?![${CYRILLIC}A-Za-z]))`, 'g'), `$1${NBSP}`)
      // розряди: 1 200 → 1 200 (нерозривний)
      .replace(new RegExp(`(?<!\\d)(\\d{1,3})${sp}(?=\\d{3}(?!\\d))`, 'g'), `$1${NBSP}`)
  );
}

/** Захищені лексеми на час обробки замінюються символом приватної зони: він не пробіл, не літера й не цифра. */
const PLACEHOLDER = '\uE000';

/** Нормалізує типографіку тексту; адреси й e-mail лишаються як є, але сусідні правила (нерозривний пробіл перед ними) працюють. */
export function normalizeTypography(text: string, options: NormalizeOptions = {}): string {
  const nbsp = options.nbsp ?? true;
  const parts = splitProtected(text);
  const masked = parts.map((part) => (part.protected ? PLACEHOLDER : part.text)).join('');
  const base = fixNumericRanges(fixDashes(fixQuotes(fixApostrophes(masked))));
  const normalized = nbsp ? fixSpaces(base) : base.replace(new RegExp(NBSP, 'g'), ' ');
  const protectedTokens = parts.filter((part) => part.protected).map((part) => part.text);
  let index = 0;
  return normalized.replace(new RegExp(PLACEHOLDER, 'g'), () => protectedTokens[index++] ?? '');
}
