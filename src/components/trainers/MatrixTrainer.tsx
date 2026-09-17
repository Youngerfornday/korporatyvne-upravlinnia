/**
 * React-острів тренажера-матриці практичної (client:only): навчальна спроба з розбором кожної ознаки →
 * оцінювана спроба без розбору до завершення → бал за рубрикою реєстру й XP. Дані, джерела й рубрика — через props;
 * збереження — лише через клієнт прогресу. Без window.location і base-URL (придатний для SCORM).
 */
import { useEffect, useRef } from 'react';
import { attemptProgress, matrixProgressText, type MatrixDefinition } from '../../engines/matrix';
import { Icon } from '../quiz/Icon';
import { FeatureBoard } from './matrix/FeatureBoard';
import { LearningDonePanel, RecordedPanel, ResultPanel, type MatrixRubric } from './matrix/MatrixPanels';
import type { MatrixSources } from './matrix/SourceLinks';
import { useMatrixSession, type MatrixController } from './matrix/use-matrix-session';

export interface MatrixTrainerProps {
  readonly practicalId: string;
  readonly matrix: MatrixDefinition;
  readonly sources: MatrixSources;
  readonly rubric: MatrixRubric;
}

const STAGES = [
  { id: 'learning', title: 'Навчальна спроба' },
  { id: 'graded', title: 'Оцінювана спроба' },
  { id: 'result', title: 'Результат' },
] as const;

type StageView = 'learning' | 'learning-done' | 'graded' | 'result' | 'recorded';

const STAGE_HEADINGS: Readonly<Record<StageView, { readonly title: string; readonly text: string }>> = {
  learning: { title: 'Спроба 1 · навчальна', text: 'Зіставте формулювання ознаки з моделями й натисніть «Перевірити ознаку» — відкриється розбір кожної клітинки з джерелом.' },
  'learning-done': { title: 'Навчальну спробу завершено', text: 'Перегляньте підсумок і переходьте до оцінюваної спроби.' },
  graded: { title: 'Спроба 2 · оцінювана', text: 'Розбору до завершення немає. Відповіді можна змінювати, доки не натиснете «Завершити спробу».' },
  result: { title: 'Результат оцінюваної спроби', text: 'Бал — за рубрикою практичної; нижче розбір кожного формулювання.' },
  recorded: { title: 'Матриця моделей', text: 'Ваш результат збережено в браузері.' },
};

function stepState(view: StageView, step: (typeof STAGES)[number]['id']): 'done' | 'doing' | 'todo' {
  const order: Readonly<Record<StageView, number>> = { learning: 0, 'learning-done': 1, graded: 1, result: 2, recorded: 3 };
  const index = STAGES.findIndex((stage) => stage.id === step);
  const current = order[view];
  if (index < current) return 'done';
  return index === current ? 'doing' : 'todo';
}

function Actions({ controller, total, answered }: { readonly controller: MatrixController; readonly total: number; readonly answered: number }) {
  const { attempt, featureIndex } = controller;
  const group = attempt.groups[featureIndex];
  const isLast = featureIndex === attempt.groups.length - 1;

  if (attempt.mode === 'learning' && group) {
    const checked = attempt.checkedFeatures.includes(group.featureId);
    const allChecked = attempt.checkedFeatures.length === attempt.groups.length;
    return (
      <div className="tactions">
        {!checked && (
          <button type="button" className="btn btn-primary" onClick={controller.check} data-matrix-check>
            Перевірити ознаку
          </button>
        )}
        {checked && !allChecked && (
          <button type="button" className="btn btn-primary" onClick={() => controller.goTo(nextUnchecked(controller))} data-matrix-next>
            Наступна ознака <Icon name="arrow-r" />
          </button>
        )}
        {allChecked && (
          <button type="button" className="btn btn-primary" onClick={controller.finish} data-matrix-finish>
            Завершити навчальну спробу
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="tactions">
        <button type="button" className="btn btn-secondary" onClick={() => controller.goTo(featureIndex - 1)} disabled={featureIndex === 0} data-matrix-prev>
          <Icon name="chev-l" /> Назад
        </button>
        {!isLast && (
          <button type="button" className="btn btn-primary" onClick={() => controller.goTo(featureIndex + 1)} data-matrix-next>
            Далі <Icon name="arrow-r" />
          </button>
        )}
        {(isLast || answered === total) && (
          <button type="button" className={isLast ? 'btn btn-primary' : 'btn btn-secondary'} onClick={controller.finish} data-matrix-finish>
            Завершити спробу
          </button>
        )}
      </div>
      {controller.confirmFinish && (
        <div className="q-confirm" role="alertdialog" aria-labelledby="matrix-confirm-title" aria-describedby="matrix-confirm-text" data-matrix-confirm>
          <b id="matrix-confirm-title">Завершити оцінювану спробу?</b>
          <p id="matrix-confirm-text">
            Без відповіді ще {total - answered} з {total} формулювань — вони зарахуються як неправильні.
          </p>
          <div className="right">
            <button type="button" className="btn btn-secondary" onClick={controller.cancelFinish} autoFocus>
              Повернутися
            </button>
            <button type="button" className="btn btn-primary" onClick={controller.finish} data-matrix-finish-confirm>
              Завершити все одно
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function nextUnchecked(controller: MatrixController): number {
  const { attempt, featureIndex } = controller;
  const count = attempt.groups.length;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (featureIndex + offset) % count;
    const group = attempt.groups[index];
    if (group && !attempt.checkedFeatures.includes(group.featureId)) return index;
  }
  return featureIndex;
}

export function MatrixTrainer({ practicalId, matrix, sources, rubric }: MatrixTrainerProps) {
  const controller = useMatrixSession(matrix, practicalId);
  const { stage, attempt, progress, practice } = controller;
  const stageRef = useRef<HTMLHeadingElement>(null);
  const featureRef = useRef<HTMLHeadingElement>(null);
  const recordedRef = useRef<HTMLHeadingElement>(null);

  const recorded = progress.client ? progress.state.activities[controller.activityId] : undefined;
  const view: StageView = stage === 'result' ? 'result' : recorded && !practice ? 'recorded' : stage;
  const total = attempt.groups.reduce((sum, group) => sum + group.itemIds.length, 0);
  const counts = attemptProgress(attempt, matrix);

  /**
   * Фокус: новий етап — на його заголовок; інша ознака чи перевірка — на заголовок ознаки.
   * Гідрація прогресу (поява клієнта) фокус не переносить, щоб сторінка не прокручувалася сама.
   */
  const focusKey = useRef<{ view: StageView; practice: boolean; hydrated: boolean; feature: number; checked: number } | null>(null);
  useEffect(() => {
    const previous = focusKey.current;
    const next = { view, practice, hydrated: progress.client !== null, feature: controller.featureIndex, checked: attempt.checkedFeatures.length };
    focusKey.current = next;
    if (!previous || previous.hydrated !== next.hydrated) return;
    if (previous.view !== next.view || previous.practice !== next.practice) {
      (next.view === 'recorded' ? recordedRef.current : stageRef.current)?.focus();
      return;
    }
    if (previous.feature !== next.feature || previous.checked !== next.checked) featureRef.current?.focus();
  }, [view, practice, progress.client, controller.featureIndex, attempt.checkedFeatures.length]);

  const heading = STAGE_HEADINGS[view];
  return (
    <section className="matrix" aria-labelledby="matrix-stage-title" data-matrix data-stage={view} data-practice={practice ? '' : undefined}>
      <header className="matrix-head">
        <ol className="msteps" aria-label="Етапи тренажера">
          {STAGES.map((step) => {
            const state = view === 'recorded' ? 'done' : stepState(view, step.id);
            return (
              <li key={step.id} data-state={state} aria-current={state === 'doing' ? 'step' : undefined}>
                <span className={`mark mark-${state}`} role="img" aria-label={state === 'done' ? 'пройдено' : state === 'doing' ? 'поточний етап' : 'попереду'}>
                  {state === 'done' && <Icon name="check" />}
                  {state === 'doing' && <Icon name="play" />}
                </span>
                <span>{step.title}</span>
              </li>
            );
          })}
        </ol>
        {view !== 'recorded' && (
          <>
            <h3 className="h3" id="matrix-stage-title" tabIndex={-1} ref={stageRef} data-matrix-stage-heading>
              {practice && view !== 'result' ? 'Тренувальне проходження · без оцінки' : heading.title}
            </h3>
            <p className="muted small">{heading.text}</p>
          </>
        )}
        {view === 'recorded' && (
          <h3 className="visually-hidden" id="matrix-stage-title">
            {heading.title}
          </h3>
        )}
        {(view === 'learning' || view === 'graded') && (
          <p className="mcount num" data-matrix-count>
            {matrixProgressText(counts)}
            {attempt.mode === 'learning' ? ` · перевірено ознак ${counts.checkedFeatures} з ${counts.features}` : ''}
          </p>
        )}
      </header>

      {view === 'recorded' && recorded && (
        <RecordedPanel share={recorded.bestScore} total={total} rubric={rubric} headingRef={recordedRef} onPractice={() => controller.restart(true)} />
      )}

      {(view === 'learning' || view === 'graded') && (
        <>
          <FeatureBoard
            attempt={attempt}
            matrix={matrix}
            sources={sources}
            featureIndex={controller.featureIndex}
            headingRef={featureRef}
            onSelect={controller.select}
            onNavigate={controller.goTo}
          />
          {controller.issue && (
            <p className="q-issue" role="alert" data-matrix-issue>
              <Icon name="alert" className="icon icon-sm" />
              {controller.issue}
            </p>
          )}
          <Actions controller={controller} total={total} answered={counts.answered} />
        </>
      )}

      {view === 'learning-done' && (
        <LearningDonePanel
          attempt={controller.session.learning}
          matrix={matrix}
          rubric={rubric}
          practice={practice}
          onStartGraded={controller.startGraded}
          onRestart={() => controller.restart(true)}
        />
      )}

      {view === 'result' && controller.session.graded && (
        <ResultPanel attempt={controller.session.graded} matrix={matrix} sources={sources} rubric={rubric} outcome={controller.outcome} onRestart={() => controller.restart(true)} />
      )}

      <div className="visually-hidden" role="status" aria-live="polite" data-matrix-live>
        {controller.announcement}
      </div>
      {!progress.persistent && <p className="faint small">Сховище браузера недоступне: результат збережеться лише до закриття вкладки.</p>}
    </section>
  );
}
