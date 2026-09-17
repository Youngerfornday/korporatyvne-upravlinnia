/**
 * Стан острова тренажера-матриці поверх рушія `engines/matrix`: сесія (навчальна → оцінювана), поточна ознака,
 * повідомлення для aria-live, тренувальний повтор без оцінки й ідемпотентна подія XP за оцінювану спробу.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { eventOutcomeText } from '../../../engines/gamification';
import {
  attemptProgress,
  checkFeature,
  currentAttempt,
  featureCheckText,
  finishMatrixAttempt,
  matrixActivityId,
  matrixCompletedEvent,
  matrixStage,
  replaceCurrentAttempt,
  reviewItem,
  selectModel,
  startGradedAttempt,
  startMatrixSession,
  summarizeMatrixAttempt,
  type MatrixAttempt,
  type MatrixDefinition,
  type MatrixSession,
  type MatrixStage,
} from '../../../engines/matrix';
import { useProgress, type ProgressHandle } from '../../progress/use-progress';

export interface MatrixController {
  readonly session: MatrixSession;
  readonly stage: MatrixStage;
  readonly attempt: MatrixAttempt;
  readonly featureIndex: number;
  readonly issue: string | null;
  readonly announcement: string;
  readonly outcome: string | null;
  readonly practice: boolean;
  readonly confirmFinish: boolean;
  readonly progress: ProgressHandle;
  readonly activityId: string;
  select(itemId: string, modelId: string | null): void;
  check(): boolean;
  goTo(index: number): void;
  finish(): boolean;
  cancelFinish(): void;
  startGraded(): void;
  restart(practice: boolean): void;
}

function newSession(matrix: MatrixDefinition, practicalId: string, run: number): MatrixSession {
  const now = new Date();
  return startMatrixSession({ matrix, seed: `${practicalId}:${now.getTime()}:${run}`, now });
}

export function useMatrixSession(matrix: MatrixDefinition, practicalId: string): MatrixController {
  const progress = useProgress();
  const activityId = matrixActivityId(practicalId);
  const [run, setRun] = useState(0);
  const [session, setSession] = useState<MatrixSession>(() => newSession(matrix, practicalId, 0));
  const [featureIndex, setFeatureIndex] = useState(0);
  const [issue, setIssue] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const applied = useRef<string | null>(null);

  const stage = matrixStage(session);
  const attempt = currentAttempt(session);

  const update = useCallback((next: MatrixAttempt) => setSession((previous) => replaceCurrentAttempt(previous, next)), []);

  const select = useCallback(
    (itemId: string, modelId: string | null) => {
      const result = selectModel(attempt, matrix, itemId, modelId);
      if (!result.ok) {
        setIssue(result.error.message);
        return;
      }
      update(result.value);
      setIssue(null);
      setConfirmFinish(false);
    },
    [attempt, matrix, update],
  );

  const check = useCallback((): boolean => {
    const group = attempt.groups[featureIndex];
    if (!group) return false;
    const result = checkFeature(attempt, matrix, group.featureId);
    if (!result.ok) {
      setIssue(result.error.message);
      return false;
    }
    update(result.value);
    setIssue(null);
    const reviews = group.itemIds.map((itemId) => reviewItem(result.value, matrix, itemId));
    const title = matrix.features.find((feature) => feature.id === group.featureId)?.title ?? '';
    setAnnouncement(featureCheckText(title, reviews.filter((review) => review.state === 'right').length, reviews.length));
    return true;
  }, [attempt, featureIndex, matrix, update]);

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= attempt.groups.length) return;
      setFeatureIndex(index);
      setIssue(null);
      setConfirmFinish(false);
    },
    [attempt.groups.length],
  );

  const finish = useCallback((): boolean => {
    const counts = attemptProgress(attempt, matrix);
    if (attempt.mode === 'graded' && counts.answered < counts.total && !confirmFinish) {
      setConfirmFinish(true);
      return false;
    }
    const result = finishMatrixAttempt(attempt, matrix, new Date());
    if (!result.ok) {
      setIssue(result.error.message);
      return false;
    }
    update(result.value);
    setIssue(null);
    setConfirmFinish(false);
    const summary = summarizeMatrixAttempt(result.value, matrix);
    setAnnouncement(`Спробу завершено: правильно ${summary.right} з ${summary.total}.`);
    return true;
  }, [attempt, confirmFinish, matrix, update]);

  const startGraded = useCallback(() => {
    const result = startGradedAttempt(session, matrix, new Date());
    if (!result.ok) {
      setIssue(result.error.message);
      return;
    }
    setSession(result.value);
    setFeatureIndex(0);
    setIssue(null);
    setAnnouncement('Оцінювана спроба: формулювання перемішано заново, розбір — після завершення.');
  }, [matrix, session]);

  const restart = useCallback(
    (asPractice: boolean) => {
      const nextRun = run + 1;
      setRun(nextRun);
      setSession(newSession(matrix, practicalId, nextRun));
      setPractice(asPractice);
      setFeatureIndex(0);
      setIssue(null);
      setOutcome(null);
      setConfirmFinish(false);
      setAnnouncement(asPractice ? 'Тренувальне проходження без оцінки: навчальна спроба з розбором.' : '');
    },
    [matrix, practicalId, run],
  );

  useEffect(() => {
    const graded = session.graded;
    if (stage !== 'result' || practice || !graded || !progress.client || applied.current === graded.startedAt) return;
    applied.current = graded.startedAt;
    const event = matrixCompletedEvent(graded, summarizeMatrixAttempt(graded, matrix), practicalId);
    if (!event) return;
    const result = progress.client.apply(event);
    setOutcome(result.ok ? eventOutcomeText(result.value) : result.error.message);
  }, [matrix, practicalId, practice, progress.client, session.graded, stage]);

  return {
    session,
    stage,
    attempt,
    featureIndex,
    issue,
    announcement,
    outcome,
    practice,
    confirmFinish,
    progress,
    activityId,
    select,
    check,
    goTo,
    finish,
    cancelFinish: () => setConfirmFinish(false),
    startGraded,
    restart,
  };
}
