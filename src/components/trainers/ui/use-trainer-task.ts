/**
 * Режим «Задача» тренажера-калькулятора: варіант із генератора (seeded), чернетка відповіді, перевірка,
 * XP через клієнтський шар прогресу — лише за новий розв’язаний варіант (`trainer-completed` з variantId).
 * Острів не звертається до сховища напряму: лише ProgressClient (localStorage на сайті, SCORM у пакеті).
 */
import { useCallback, useRef, useState } from 'react';
import { createSeededRandom, type RandomSource } from '../../../engines/shared/random';
import type { Result } from '../../../engines/shared/result';
import { useProgress } from '../../progress/use-progress';
import type { ProgressClient } from '../../progress/client';
import type { LearningEvent } from '../../../engines/gamification';
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

type TrainerEvent = Extract<LearningEvent, { type: 'trainer-completed' }>;
type TrainerCompletionClient = Pick<ProgressClient, 'getState' | 'apply'>;

export type TrainerCompletionResult =
  | { readonly status: 'unavailable' | 'failed' | 'already-solved'; readonly nextApplied: string | null; readonly outcomeText: string }
  | { readonly status: 'saved'; readonly nextApplied: string; readonly outcomeText: string };

export function applyTrainerCompletion(client: TrainerCompletionClient | null, event: TrainerEvent, appliedVariantId: string | null): TrainerCompletionResult {
  if (!client) return { status: 'unavailable', nextApplied: appliedVariantId, outcomeText: 'Прогрес ще завантажується — XP не нараховано.' };
  if (appliedVariantId === event.variantId || isVariantSolved(client.getState(), event.activityId, event.variantId ?? '')) {
    return { status: 'already-solved', nextApplied: appliedVariantId, outcomeText: ALREADY_SOLVED_TEXT };
  }
  const outcome = client.apply(event);
  if (!outcome.ok) return { status: 'failed', nextApplied: appliedVariantId, outcomeText: outcome.error.message };
  return { status: 'saved', nextApplied: event.variantId ?? event.id, outcomeText: solvedOutcomeText(outcome.value) };
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
    if (!checked.value.solved) {
      setResult(checked.value);
      setOutcomeText(WRONG_ANSWER_TEXT);
      return [];
    }
    const client = progress.client;
    const completion = applyTrainerCompletion(client, {
      id: `trainer:${activityId}:${variant.variantId}`,
      type: 'trainer-completed',
      activityId,
      score: 1,
      variantId: variant.variantId,
    }, applied.current);
    setOutcomeText(completion.outcomeText);
    if (completion.status === 'failed' || completion.status === 'unavailable') return [];
    setResult(checked.value);
    if (completion.status === 'saved') applied.current = completion.nextApplied;
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
