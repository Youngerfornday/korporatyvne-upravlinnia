/**
 * Стан спроби тренувального тесту поверх рушія quiz (режим immediate): чернетки відповідей,
 * поточне питання, позначки, завершення й повтор із новим зерном. Стан незмінний; зміни — через сеттери.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  answerQuestion,
  finishAttempt,
  startAttempt,
  summarizeAttempt,
  type AttemptSummary,
  type Question,
  type QuestionResponse,
  type QuizAttempt,
} from '../../engines/quiz';
import { createSeededRandom } from '../../engines/shared/random';

export type QuizPhase = 'running' | 'summary' | 'review';

export interface QuizController {
  readonly attempt: QuizAttempt;
  readonly questions: readonly Question[];
  readonly phase: QuizPhase;
  readonly current: number;
  readonly drafts: Readonly<Record<number, QuestionResponse>>;
  readonly issue: string | null;
  readonly flagged: ReadonlySet<number>;
  readonly summary: AttemptSummary | null;
  /** Скільки разів починали заново на цій сторінці (для ключів React і зерна). */
  readonly run: number;
  setDraft(slotIndex: number, response: QuestionResponse): void;
  submit(slotIndex: number): boolean;
  goTo(slotIndex: number): void;
  toggleFlag(slotIndex: number): void;
  finish(): void;
  review(): void;
  backToSummary(): void;
  restart(): void;
}

function newAttempt(quizId: string, questions: readonly Question[], run: number): QuizAttempt {
  const now = new Date();
  return startAttempt({ quizId, questions, random: createSeededRandom(`${quizId}:${now.getTime()}:${run}`), now, mode: 'immediate' });
}

export function useQuiz(quizId: string, questions: readonly Question[]): QuizController {
  const [run, setRun] = useState(0);
  const [attempt, setAttempt] = useState<QuizAttempt>(() => newAttempt(quizId, questions, 0));
  const [phase, setPhase] = useState<QuizPhase>('running');
  const [current, setCurrent] = useState(0);
  const [drafts, setDrafts] = useState<Readonly<Record<number, QuestionResponse>>>({});
  const [issue, setIssue] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<ReadonlySet<number>>(() => new Set());

  const summary = useMemo(() => (attempt.status === 'finished' ? summarizeAttempt(attempt) : null), [attempt]);

  const setDraft = useCallback((slotIndex: number, response: QuestionResponse) => {
    setDrafts((previous) => ({ ...previous, [slotIndex]: response }));
    setIssue(null);
  }, []);

  const submit = useCallback(
    (slotIndex: number): boolean => {
      const draft = drafts[slotIndex];
      if (!draft) {
        setIssue('Дайте відповідь, перш ніж надсилати.');
        return false;
      }
      const result = answerQuestion(attempt, questions, slotIndex, draft, new Date());
      if (!result.ok) {
        setIssue(result.error.message);
        return false;
      }
      setAttempt(result.value);
      setIssue(null);
      return true;
    },
    [attempt, drafts, questions],
  );

  const goTo = useCallback(
    (slotIndex: number) => {
      if (slotIndex < 0 || slotIndex >= attempt.slots.length) return;
      setCurrent(slotIndex);
      setIssue(null);
    },
    [attempt.slots.length],
  );

  const toggleFlag = useCallback((slotIndex: number) => {
    setFlagged((previous) => {
      const next = new Set(previous);
      if (next.has(slotIndex)) next.delete(slotIndex);
      else next.add(slotIndex);
      return next;
    });
  }, []);

  const finish = useCallback(() => {
    setAttempt((previous) => finishAttempt(previous, questions, new Date()));
    setPhase('summary');
    setIssue(null);
  }, [questions]);

  const restart = useCallback(() => {
    const nextRun = run + 1;
    setRun(nextRun);
    setAttempt(newAttempt(quizId, questions, nextRun));
    setPhase('running');
    setCurrent(0);
    setDrafts({});
    setIssue(null);
    setFlagged(new Set());
  }, [quizId, questions, run]);

  return {
    attempt,
    questions,
    phase,
    current,
    drafts,
    issue,
    flagged,
    summary,
    run,
    setDraft,
    submit,
    goTo,
    toggleFlag,
    finish,
    review: () => {
      setCurrent(0);
      setPhase('review');
    },
    backToSummary: () => setPhase('summary'),
    restart,
  };
}
