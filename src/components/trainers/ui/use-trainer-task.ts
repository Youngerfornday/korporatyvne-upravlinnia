/**
 * Режим «Задача» тренажера-калькулятора: варіант із генератора (seeded), чернетка відповіді, перевірка,
 * XP через клієнтський шар прогресу — лише за новий розв’язаний варіант (`trainer-completed` з variantId).
 * Острів не звертається до сховища напряму: лише ProgressClient (localStorage на сайті, SCORM у пакеті).
 */
import { useCallback, useRef, useState } from 'react';
import { createSeededRandom, type RandomSource } from '../../../engines/shared/random';
import type { Result } from '../../../engines/shared/result';
import { useProgress } from '../../progress/use-progress';
import { issuesByField, type FieldIssues, type TaskCheck } from '../model/task-check';
import { ALREADY_SOLVED_TEXT, WRONG_ANSWER_TEXT, isVariantSolved, solvedOutcomeText } from '../model/xp-text';

export interface TaskVariantBase {
  readonly variantId: string;
}

export interface TrainerTaskOptions<V extends TaskVariantBase, A> {
  readonly activityId: string;
  readonly create: (random: RandomSource) => V;
  readonly check: (variant: V, answer: A) => Result<TaskCheck, FieldIssues>;
  readonly emptyAnswer: A;
}

export interface TrainerTask<V extends TaskVariantBase, A> {
  readonly variant: V;
  /** Порядковий номер варіанта на сторінці (для ключів React і підпису). */
  readonly number: number;
  readonly answer: A;
  readonly errors: Readonly<Record<string, string>>;
  readonly check: TaskCheck | null;
  readonly outcomeText: string | null;
  readonly statusState: ReturnType<typeof useProgress>;
  setAnswer(patch: Partial<A>): void;
  submit(): FieldIssues;
  next(): void;
}

function newVariant<V>(create: (random: RandomSource) => V, activityId: string, number: number): V {
  return create(createSeededRandom(`${activityId}:${Date.now()}:${number}`));
}

export function useTrainerTask<V extends TaskVariantBase, A>({ activityId, create, check, emptyAnswer }: TrainerTaskOptions<V, A>): TrainerTask<V, A> {
  const progress = useProgress();
  const [number, setNumber] = useState(1);
  const [variant, setVariant] = useState<V>(() => newVariant(create, activityId, 1));
  const [answer, setAnswerState] = useState<A>(emptyAnswer);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [result, setResult] = useState<TaskCheck | null>(null);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);
  const applied = useRef<string | null>(null);

  const setAnswer = useCallback((patch: Partial<A>) => {
    setAnswerState((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      const keys = Object.keys(patch);
      return keys.some((key) => key in previous) ? Object.fromEntries(Object.entries(previous).filter(([key]) => !keys.includes(key))) : previous;
    });
  }, []);

  const submit = useCallback((): FieldIssues => {
    if (result) return [];
    const checked = check(variant, answer);
    if (!checked.ok) {
      setErrors(issuesByField(checked.error));
      return checked.error;
    }
    setErrors({});
    setResult(checked.value);
    if (!checked.value.solved) {
      setOutcomeText(WRONG_ANSWER_TEXT);
      return [];
    }
    const client = progress.client;
    if (!client) {
      setOutcomeText('Прогрес ще завантажується — XP не нараховано.');
      return [];
    }
    if (isVariantSolved(client.getState(), activityId, variant.variantId) || applied.current === variant.variantId) {
      setOutcomeText(ALREADY_SOLVED_TEXT);
      return [];
    }
    applied.current = variant.variantId;
    const outcome = client.apply({
      id: `trainer:${activityId}:${variant.variantId}`,
      type: 'trainer-completed',
      activityId,
      score: 1,
      variantId: variant.variantId,
    });
    setOutcomeText(outcome.ok ? solvedOutcomeText(outcome.value) : outcome.error.message);
    return [];
  }, [activityId, answer, check, progress.client, result, variant]);

  const next = useCallback(() => {
    const nextNumber = number + 1;
    setNumber(nextNumber);
    setVariant(newVariant(create, activityId, nextNumber));
    setAnswerState(emptyAnswer);
    setErrors({});
    setResult(null);
    setOutcomeText(null);
  }, [activityId, create, emptyAnswer, number]);

  return { variant, number, answer, errors, check: result, outcomeText, statusState: progress, setAnswer, submit, next };
}
