import { pluralUk } from '../../lib/plural';
import { formatPercent, roundTo } from '../shared/number-format';
import type { QuizAttempt } from './attempt';
import type { QuestionState } from './types';

/**
 * Підсумок спроби. Бали — як у Moodle: Σ(частка × максимальний бал слота); оцінка у відсотках —
 * quiz_rescale_grade на шкалі 100 з округленням до 2 знаків (типове decimalpoints тесту).
 * Moodle не обмежує суму знизу, тому `fraction` і `percent` можуть бути від’ємними;
 * `score` для ProgressStore і SCORM обмежено відрізком [0, 1].
 */
export interface AttemptSummary {
  readonly quizId: string;
  readonly status: QuizAttempt['status'];
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly marks: number;
  readonly maxMarks: number;
  readonly fraction: number;
  readonly percent: number;
  /** 0..1 — значення для `ProgressState.quizzes[id].bestScore` і події XP. */
  readonly score: number;
  readonly counts: Readonly<Record<QuestionState | 'unanswered', number>>;
}

const PERCENT_DECIMALS = 2;
const FULL_PERCENT = 100;

export function summarizeAttempt(attempt: QuizAttempt): AttemptSummary {
  const maxMarks = attempt.slots.reduce((acc, slot) => acc + slot.maxMark, 0);
  const marks = attempt.slots.reduce((acc, slot) => acc + (slot.grade?.fraction ?? 0) * slot.maxMark, 0);
  const fraction = maxMarks > 0 ? marks / maxMarks : 0;
  const counts = { right: 0, partial: 0, wrong: 0, gaveup: 0, unanswered: 0 };
  for (const slot of attempt.slots) {
    const key = slot.grade?.state ?? 'unanswered';
    counts[key] += 1;
  }
  return {
    quizId: attempt.quizId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    marks,
    maxMarks,
    fraction,
    percent: roundTo(fraction * FULL_PERCENT, PERCENT_DECIMALS),
    score: Math.min(Math.max(fraction, 0), 1),
    counts,
  };
}

/** SCORM 1.2: `cmi.core.lesson_status` з допустимого словника. */
export type ScormLessonStatus = 'passed' | 'failed' | 'completed' | 'incomplete';

export interface ScormReport {
  readonly scoreRaw: number;
  readonly scoreMin: 0;
  readonly scoreMax: 100;
  readonly lessonStatus: ScormLessonStatus;
}

export interface ScormReportOptions {
  /** Прохідний відсоток; без нього завершена спроба має статус `completed` (тренажери поза підсумком). */
  readonly passPercent?: number;
}

export function toScormReport(summary: AttemptSummary, options: ScormReportOptions = {}): ScormReport {
  const scoreRaw = roundTo(summary.score * FULL_PERCENT, PERCENT_DECIMALS);
  const finishedStatus = (): ScormLessonStatus => {
    if (options.passPercent === undefined) return 'completed';
    return scoreRaw >= options.passPercent ? 'passed' : 'failed';
  };
  return {
    scoreRaw,
    scoreMin: 0,
    scoreMax: FULL_PERCENT,
    lessonStatus: summary.status === 'finished' ? finishedStatus() : 'incomplete',
  };
}

export type ScormCmiKey = 'cmi.core.score.raw' | 'cmi.core.score.min' | 'cmi.core.score.max' | 'cmi.core.lesson_status';

/** Значення для LMSSetValue (SCORM 1.2 передає все рядками; CMIDecimal — з крапкою). */
export function toScormCmiValues(report: ScormReport): Readonly<Record<ScormCmiKey, string>> {
  return {
    'cmi.core.score.raw': String(report.scoreRaw),
    'cmi.core.score.min': String(report.scoreMin),
    'cmi.core.score.max': String(report.scoreMax),
    'cmi.core.lesson_status': report.lessonStatus,
  };
}

const MARK_FORMS = { one: 'бал', few: 'бали', many: 'балів', other: 'бала' } as const;
const POSSIBLE_FORMS = { one: 'можливого', few: 'можливих', many: 'можливих', other: 'можливого' } as const;
const QUESTION_FORMS = { one: 'питання', few: 'питань', many: 'питань', other: 'питання' } as const;

/** «Ви отримали 3 бали з 5 можливих (60 %). Правильно: 2 з 3 питань.» — для aria-live підсумку. */
export function attemptSummaryText(summary: AttemptSummary): string {
  const marks = pluralUk(roundTo(summary.marks, PERCENT_DECIMALS), MARK_FORMS);
  const possible = pluralUk(roundTo(summary.maxMarks, PERCENT_DECIMALS), POSSIBLE_FORMS);
  const total = Object.values(summary.counts).reduce((acc, count) => acc + count, 0);
  const percent = formatPercent(summary.percent / FULL_PERCENT);
  return `Ви отримали ${marks} з ${possible} (${percent}). Правильно: ${summary.counts.right} з ${pluralUk(total, QUESTION_FORMS)}.`;
}
