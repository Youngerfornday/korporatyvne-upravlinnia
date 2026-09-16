/**
 * React-острів тренувального тесту (client:only): одне питання на екрані, миттєвий розбір, навігатор,
 * підсумок із XP через клієнтський шар прогресу. Уся випадковість — через seed, тому повтор перемішує заново.
 */
import { useEffect, useRef, useState } from 'react';
import type { EventOutcome } from '../../engines/gamification';
import type { Question } from '../../engines/quiz';
import { useProgress } from '../progress/use-progress';
import { AttemptSummaryView } from './AttemptSummary';
import { Icon } from './Icon';
import { QuestionCard } from './QuestionCard';
import { QuestionNav } from './QuestionNav';
import { XpBox } from './XpBox';
import { questionsText } from './quiz-texts';
import { useQuiz } from './use-quiz';

export interface QuizIslandProps {
  readonly quizId: string;
  readonly topicId: string;
  readonly topicHref: string;
  readonly questions: readonly Question[];
}

export function QuizIsland({ quizId, topicId, topicHref, questions }: QuizIslandProps) {
  const quiz = useQuiz(quizId, questions);
  const progress = useProgress();
  const [outcome, setOutcome] = useState<EventOutcome | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const appliedRun = useRef<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const slot = quiz.attempt.slots[quiz.current];
  const question = slot ? questions.find((candidate) => candidate.id === slot.questionId) : undefined;
  const total = quiz.attempt.slots.length;
  const answered = quiz.attempt.slots.filter((item) => item.response !== null).length;
  const right = quiz.attempt.slots.filter((item) => item.grade?.state === 'right').length;
  const unanswered = total - answered;
  const isRunning = quiz.phase === 'running';

  useEffect(() => {
    if (quiz.phase !== 'summary' || !quiz.summary || !progress.client || appliedRun.current === quiz.run) return;
    appliedRun.current = quiz.run;
    const stamp = Date.parse(quiz.summary.finishedAt ?? '') || Date.now();
    const result = progress.client.apply({ id: `quiz:${quizId}:${stamp}`, type: 'quiz-finished', quizId, score: quiz.summary.score });
    setOutcome(result.ok ? result.value : null);
    setOutcomeError(result.ok ? null : result.error.message);
  }, [quiz.phase, quiz.summary, quiz.run, progress.client, quizId]);

  useEffect(() => {
    if (quiz.phase === 'summary') document.querySelector<HTMLElement>('[data-summary-heading]')?.focus();
  }, [quiz.phase]);

  const submit = () => {
    if (quiz.submit(quiz.current)) requestAnimationFrame(() => nextRef.current?.focus());
  };

  const finish = () => {
    if (unanswered > 0 && !confirmFinish) {
      setConfirmFinish(true);
      return;
    }
    setConfirmFinish(false);
    quiz.finish();
  };

  /** Перехід із навігатора завжди повертає фокус на заголовок питання — навіть якщо це поточне питання. */
  const selectFromNav = (index: number) => {
    if (quiz.phase === 'summary') quiz.review();
    quiz.goTo(index);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.qcard .q-title')?.focus());
  };

  const restart = () => {
    setOutcome(null);
    setOutcomeError(null);
    setConfirmFinish(false);
    quiz.restart();
  };

  return (
    <div className="quiz" data-quiz data-phase={quiz.phase}>
      <div className="quiz-stats" aria-live="polite">
        <span>
          Питання <b className="num">{isRunning ? `${quiz.current + 1} із ${total}` : `${total}`}</b>
        </span>
        <span>
          Відповіли <b className="num">{answered}</b>
        </span>
        <span>
          Правильно <b className="num" data-quiz-right>{right}</b>
        </span>
      </div>

      <div className="quiz-layout">
        <div>
          {quiz.phase === 'summary' && quiz.summary ? (
            <AttemptSummaryView summary={quiz.summary} outcome={outcome} outcomeError={outcomeError} topicHref={topicHref} onRestart={restart} onReview={quiz.review} />
          ) : (
            slot &&
            question && (
              <>
                <QuestionCard
                  key={`${quiz.run}-${quiz.current}`}
                  index={quiz.current}
                  total={total}
                  question={question}
                  slot={slot}
                  draft={quiz.drafts[quiz.current]}
                  issue={quiz.issue}
                  readOnly={!isRunning}
                  topicHref={topicHref}
                  onDraft={(response) => quiz.setDraft(quiz.current, response)}
                />

                {confirmFinish && (
                  <div className="q-confirm" role="alertdialog" aria-labelledby="finish-confirm-title" aria-describedby="finish-confirm-text">
                    <b id="finish-confirm-title">Завершити спробу?</b>
                    <p id="finish-confirm-text">
                      Без відповіді ще {questionsText(unanswered)} — вони зарахуються як 0 балів.
                    </p>
                    <div className="right">
                      <button type="button" className="btn btn-secondary" onClick={() => setConfirmFinish(false)} autoFocus>
                        Повернутися
                      </button>
                      <button type="button" className="btn btn-primary" onClick={finish} data-quiz-finish-confirm>
                        Завершити все одно
                      </button>
                    </div>
                  </div>
                )}

                <div className="q-actions">
                  {isRunning ? (
                    <button type="button" className="btn btn-ghost" aria-pressed={quiz.flagged.has(quiz.current)} onClick={() => quiz.toggleFlag(quiz.current)} data-quiz-flag>
                      <Icon name="flag" />
                      {quiz.flagged.has(quiz.current) ? 'Зняти позначку' : 'Позначити питання'}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost" onClick={quiz.backToSummary}>
                      До підсумку
                    </button>
                  )}
                  <div className="right">
                    <button type="button" className="btn btn-secondary" onClick={() => quiz.goTo(quiz.current - 1)} disabled={quiz.current === 0}>
                      <Icon name="chev-l" />
                      Назад
                    </button>
                    {isRunning && slot.response === null && (
                      <button type="button" className="btn btn-primary" onClick={submit} data-quiz-submit>
                        Відповісти
                      </button>
                    )}
                    {quiz.current < total - 1 ? (
                      <button type="button" className="btn btn-primary" ref={nextRef} onClick={() => quiz.goTo(quiz.current + 1)} data-quiz-next>
                        Далі <Icon name="arrow-r" />
                      </button>
                    ) : (
                      isRunning && (
                        <button type="button" className="btn btn-primary" ref={nextRef} onClick={finish} data-quiz-finish>
                          Завершити спробу
                        </button>
                      )
                    )}
                  </div>
                </div>
                {isRunning && quiz.current < total - 1 && answered === total && (
                  <p className="q-finish-hint">
                    Усі питання мають відповідь.{' '}
                    <button type="button" className="btn btn-primary btn-sm" onClick={finish} data-quiz-finish>
                      Завершити спробу
                    </button>
                  </p>
                )}
              </>
            )
          )}
          <p className="quiz-note">
            Тренувальний тест не впливає на оцінку. Контрольні модульні тести з іншим банком питань проходять у Moodle (eln.stu.cn.ua); там правильні відповіді відкриваються після закриття тесту.
          </p>
        </div>

        <aside className="quiz-side">
          <QuestionNav slots={quiz.attempt.slots} current={quiz.phase === 'summary' ? -1 : quiz.current} flagged={quiz.flagged} onSelect={selectFromNav} />
          <XpBox state={progress.state} topicId={topicId} persistent={progress.persistent} />
        </aside>
      </div>
    </div>
  );
}
