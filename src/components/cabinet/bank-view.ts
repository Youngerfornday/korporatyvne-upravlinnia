/**
 * Оглядач тренувального банку для викладача: питання з типом, рівнем Блума, нормою і правильною відповіддю.
 * Це публічний тренувальний банк — ті самі ключі вже є в тесті на сайті; контрольних банків тут немає.
 */
import type { Question } from '../../content/schemas/questions';
import { formatDate } from '../../lib/course-data-pure';
import { formatNumber } from '../../engines/shared/number-format';
import { BLOOM_LABELS, marksText, questionTypeLabel } from '../quiz/quiz-texts';

const FULL_CREDIT = 100;
const EPSILON = 0.001;

export type StemPart = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'answer'; readonly text: string };

export interface AnswerRow {
  readonly text: string;
  readonly correct: boolean;
  /** «100 %», «50 %», «−25 %»: показується, якщо оцінка не 0 і не 100. */
  readonly fraction?: string;
  readonly feedback?: string;
}

export interface LawRefView {
  readonly act: string;
  readonly article: string;
  readonly checked: string;
  readonly url?: string;
}

export interface BankQuestionView {
  readonly id: string;
  readonly number: number;
  readonly typeLabel: string;
  readonly bloomLabel: string;
  readonly mark: string;
  readonly stem: readonly StemPart[];
  readonly answers: readonly AnswerRow[];
  readonly pairs: readonly { readonly prompt: string; readonly answer: string }[];
  readonly distractors: readonly string[];
  readonly correctText?: string;
  readonly generalFeedback: string;
  readonly lawRefs: readonly LawRefView[];
}

function percent(fraction: number): string {
  return `${formatNumber(fraction, { maximumFractionDigits: 2 }).replace('-', '−')}\u00A0%`;
}

function answerRow(answer: { text: string; fraction: number; feedback: string }): AnswerRow {
  const full = Math.abs(answer.fraction - FULL_CREDIT) < EPSILON;
  const partial = !full && Math.abs(answer.fraction) > EPSILON;
  return { text: answer.text, correct: answer.fraction > EPSILON, ...(partial ? { fraction: percent(answer.fraction) } : {}), feedback: answer.feedback };
}

function numericText(value: number, tolerance: number): string {
  return tolerance > 0 ? `${formatNumber(value)} ± ${formatNumber(tolerance)}` : formatNumber(value);
}

function bestNumeric(answers: readonly { value: number; tolerance: number; fraction: number }[]): string {
  const best = [...answers].sort((a, b) => b.fraction - a.fraction)[0];
  return best ? numericText(best.value, best.tolerance) : '—';
}

function splitStem(stem: string, pattern: RegExp, fill: (index: number) => string): StemPart[] {
  const parts: StemPart[] = [];
  let last = 0;
  for (const match of stem.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: stem.slice(last, start) });
    parts.push({ kind: 'answer', text: fill(Number(match[1])) });
    last = start + match[0].length;
  }
  if (last < stem.length) parts.push({ kind: 'text', text: stem.slice(last) });
  return parts;
}

function clozeAnswer(question: Extract<Question, { type: 'multianswer' }>, number: number): string {
  const sub = question.subquestions[number - 1];
  if (!sub) return '—';
  if (sub.kind === 'numerical') return bestNumeric(sub.answers);
  const correct = sub.answers.filter((answer) => answer.fraction >= FULL_CREDIT - EPSILON).map((answer) => answer.text);
  return correct.join(' / ') || '—';
}

function typeSpecific(question: Question): Pick<BankQuestionView, 'stem' | 'answers' | 'pairs' | 'distractors' | 'correctText'> {
  const plain: StemPart[] = [{ kind: 'text', text: question.stem }];
  const empty = { answers: [], pairs: [], distractors: [] };
  switch (question.type) {
    case 'multichoice':
      return { ...empty, stem: plain, answers: question.answers.map(answerRow) };
    case 'truefalse':
      return { ...empty, stem: plain, correctText: question.correct ? 'Правда' : 'Неправда' };
    case 'matching':
      return { ...empty, stem: plain, pairs: question.pairs.map(({ prompt, answer }) => ({ prompt, answer })), distractors: question.distractors };
    case 'numerical':
      return { ...empty, stem: plain, correctText: bestNumeric(question.answers) };
    case 'calculated': {
      const answer = question.answers[0];
      if (!answer) return { ...empty, stem: plain, correctText: '—' };
      const tolerance = answer.toleranceType === 'relative' ? percent(answer.tolerance * FULL_CREDIT) : formatNumber(answer.tolerance);
      return { ...empty, stem: plain, correctText: `${answer.formula}, допуск ±${tolerance}` };
    }
    case 'ddwtos': {
      const used = new Set([...question.stem.matchAll(/\[\[(\d+)\]\]/g)].map((match) => Number(match[1])));
      return {
        ...empty,
        stem: splitStem(question.stem, /\[\[(\d+)\]\]/g, (n) => question.choices[n - 1]?.text ?? '—'),
        distractors: question.choices.filter((_, index) => !used.has(index + 1)).map((choice) => choice.text),
      };
    }
    default:
      return { ...empty, stem: splitStem(question.stem, /\{#(\d+)\}/g, (n) => clozeAnswer(question, n)) };
  }
}

export function bankQuestionView(question: Question, index: number): BankQuestionView {
  return {
    id: question.id,
    number: index + 1,
    typeLabel: questionTypeLabel(question),
    bloomLabel: BLOOM_LABELS[question.bloom],
    mark: marksText(question.defaultMark),
    ...typeSpecific(question),
    generalFeedback: question.generalFeedback,
    lawRefs: question.lawRef.map((ref) => ({ act: ref.act, article: ref.article, checked: formatDate(ref.checkedAt), ...(ref.url ? { url: ref.url } : {}) })),
  };
}
