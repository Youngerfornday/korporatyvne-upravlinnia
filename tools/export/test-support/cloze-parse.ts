/**
 * Порт розбору Cloze з Moodle 5.2.2 (`qtype_multianswer_extract_question`, question/type/multianswer/questiontype.php)
 * для тестів: ті самі регулярні вирази, `html_entity_decode` і зняття `\}`, `\#`. Дає змогу перевірити, що
 * експортер кодує спецсимволи так, як їх прочитає Moodle, без запуску Moodle.
 */

export interface ClozeAlternative {
  readonly fraction: number;
  readonly answer: string;
  readonly feedback: string;
  readonly tolerance?: number;
}

export interface ClozeSubquestion {
  readonly weight: number;
  readonly type: string;
  readonly alternatives: readonly ClozeAlternative[];
}

const FRACTION = '=|%(-?[0-9]+(?:[.,][0-9]*)?)%';
const ANSWER = '.+?(?<!\\\\|&|&amp;)(?=[~#}]|$)';
const FEEDBACK = '.*?(?<!\\\\)(?=[~}]|$)';
const ALTERNATIVE = `(${FRACTION})?(${ANSWER})(#(${FEEDBACK}))?`;
const TYPES =
  '(NUMERICAL|NM)|(MULTICHOICE|MC)|(MULTICHOICE_V|MCV)|(MULTICHOICE_H|MCH)|(SHORTANSWER|SA|MW)|(SHORTANSWER_C|SAC|MWC)|' +
  '(MULTICHOICE_S|MCS)|(MULTICHOICE_VS|MCVS)|(MULTICHOICE_HS|MCHS)|(MULTIRESPONSE|MR)|(MULTIRESPONSE_H|MRH)|' +
  '(MULTIRESPONSE_S|MRS)|(MULTIRESPONSE_HS|MRHS)';
const QUESTION = new RegExp(`\\{([0-9]*):(${TYPES}):(${ALTERNATIVE}(~${ALTERNATIVE})*)\\}`, 's');
const NUMBER = '-?(([0-9]+[.,]?[0-9]*|[.,][0-9]+)([eE][-+]?[0-9]+)?)';
const NUMERICAL = new RegExp(`^(${NUMBER})(:${NUMBER})?$`, 's');
/** Номер групи з варіантами в QUESTION: 1 — вага, 2 — тип, 3..15 — назви типів, 16 — варіанти. */
const ALTERNATIVES_GROUP = 16;

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#039': "'" };

export function htmlEntityDecode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return NAMED[body] ?? whole;
  });
}

function unescape(text: string): string {
  return htmlEntityDecode(text).replace(/\\}/g, '}').replace(/\\#/g, '#');
}

function parseAlternatives(source: string, numerical: boolean): ClozeAlternative[] {
  const result: ClozeAlternative[] = [];
  let remaining = source;
  const pattern = new RegExp(`~?${ALTERNATIVE}`, 's');
  for (let match = pattern.exec(remaining); match; match = pattern.exec(remaining)) {
    const fraction = match[1] === '=' ? 1 : match[2] ? 0.01 * Number(match[2].replace(',', '.')) : 0;
    const rawAnswer = match[3] ?? '';
    const feedback = match[5] === undefined ? '' : unescape(match[5]);
    const number = numerical ? NUMERICAL.exec(rawAnswer) : null;
    if (number) {
      result.push({ fraction, answer: number[1] ?? '', feedback, tolerance: number[6] === undefined ? 0 : Number(number[6]) });
    } else {
      result.push({ fraction, answer: unescape(rawAnswer), feedback });
    }
    remaining = remaining.split(match[0]).slice(1).join(match[0]);
  }
  return result;
}

export function parseCloze(questionText: string): { readonly text: string; readonly subquestions: ClozeSubquestion[] } {
  const subquestions: ClozeSubquestion[] = [];
  let text = questionText;
  for (let match = QUESTION.exec(text); match; match = QUESTION.exec(text)) {
    const type = match[2] ?? '';
    subquestions.push({
      weight: match[1] ? Number(match[1]) : 1,
      type,
      alternatives: parseAlternatives(match[ALTERNATIVES_GROUP] ?? '', /^(NUMERICAL|NM)$/.test(type)),
    });
    text = text.replace(match[0], `{#${subquestions.length}}`);
  }
  return { text, subquestions };
}
