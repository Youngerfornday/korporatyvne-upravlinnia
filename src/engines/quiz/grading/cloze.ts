import { parseMoodleNumber } from '../../shared/decimal-input';
import type { GradeResult, QuestionOf, QuestionState, ResponseOf } from '../types';
import { matchNumericAnswer, numericalTargets } from './numeric';
import { GAVE_UP, combineStates, graded, percentToFraction } from './states';

type Subquestion = QuestionOf<'multianswer'>['subquestions'][number];
type PartResponse = ResponseOf<'multianswer'>['parts'][number];

const UNESCAPED_STAR_RUN = /(?<!\\)\*+/;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

const APOSTROPHES = /[\u2019\u02BC\u02B9\u0027\u00B4]/g;

/**
 * Один канонічний апостроф. Moodle порівнює короткі відповіді буквально, тому експортер вивантажує
 * варіанти ’ / ' / ʼ окремими відповідями; на сайті ту саму рівність дає нормалізація.
 */
function canonicalApostrophes(value: string): string {
  return value.normalize('NFC').replace(APOSTROPHES, '\u2019');
}

/** qtype_shortanswer_question::compare_string_with_wildcard: `*` — будь-які символи, `\*` — зірочка. */
export function compareWithWildcard(text: string, pattern: string, ignoreCase: boolean): boolean {
  const bits = canonicalApostrophes(pattern).split(UNESCAPED_STAR_RUN);
  const source = bits.map((bit) => bit.replaceAll('\\*', '*').replace(REGEX_SPECIAL, '\\$&')).join('.*');
  const regex = new RegExp(`^${source}$`, ignoreCase ? 'iu' : 'u');
  return regex.test(canonicalApostrophes(text).trim());
}

export interface ClozePartMatch {
  /** Індекс відповіді підпитання, з якою збіглася частина; null — відповідь дано, але вона не збіглася. */
  readonly answerIndex: number | null;
}

/** Зіставлення частини Cloze з відповідями підпитання; null — частина без придатної до оцінювання відповіді. */
export function matchClozePart(subquestion: Subquestion, part: PartResponse): ClozePartMatch | null {
  if (subquestion.kind === 'multichoice') {
    return typeof part === 'number' && subquestion.answers[part] !== undefined ? { answerIndex: part } : null;
  }
  if (typeof part !== 'string' || part.trim() === '') return null;
  if (subquestion.kind === 'shortanswer') {
    const index = subquestion.answers.findIndex((answer) => compareWithWildcard(part, answer.text, !subquestion.caseSensitive));
    return { answerIndex: index === -1 ? null : index };
  }
  const { value } = parseMoodleNumber(part);
  return { answerIndex: value === null ? null : matchNumericAnswer(numericalTargets(subquestion.answers), value) };
}

/** Частка підпитання: multichoice і shortanswer — як є (можуть бути від’ємними), numerical — не нижче 0. */
function gradePart(subquestion: Subquestion, part: PartResponse): GradeResult | null {
  const match = matchClozePart(subquestion, part);
  if (!match) return null;
  const answer = match.answerIndex === null ? undefined : subquestion.answers[match.answerIndex];
  const fraction = answer ? percentToFraction(answer.fraction) : 0;
  return graded(subquestion.kind === 'numerical' ? Math.max(fraction, 0) : fraction);
}

/** Оцінка кожного підпитання (null — без відповіді), для розбору й підсумку. */
export function gradeClozeParts(question: QuestionOf<'multianswer'>, response: ResponseOf<'multianswer'>): readonly (GradeResult | null)[] {
  return question.subquestions.map((subquestion, index) => gradePart(subquestion, response.parts[index] ?? null));
}

/**
 * multianswer — qtype_multianswer_question::grade_response: Σ(частка × вага) / Σ ваг; підпитання без
 * відповіді дають 0, стан — combine_states. Від’ємні частки multichoice/shortanswer не обмежуються.
 */
export function gradeMultianswer(question: QuestionOf<'multianswer'>, response: ResponseOf<'multianswer'>): GradeResult {
  const parts = gradeClozeParts(question, response);
  const state = parts.reduce<QuestionState | null>((acc, part) => combineStates(acc, part ? part.state : 'gaveup'), null);
  if (state === null || state === 'gaveup') return GAVE_UP;
  const totalWeight = question.subquestions.reduce((acc, subquestion) => acc + subquestion.weight, 0);
  const weighted = question.subquestions.reduce((acc, subquestion, index) => acc + (parts[index]?.fraction ?? 0) * subquestion.weight, 0);
  return { fraction: weighted / totalWeight, state };
}
