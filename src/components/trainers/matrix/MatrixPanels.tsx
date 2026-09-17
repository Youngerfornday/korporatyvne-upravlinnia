/** Панелі етапів матриці: навчальну завершено, результат оцінюваної спроби, збережений результат. */
import type { RefObject } from 'react';
import { formatPercent } from '../../../engines/shared/number-format';
import {
  itemStateLabel,
  marksOfText,
  matrixSummaryText,
  recordedResultText,
  reviewItem,
  rubricMark,
  summarizeMatrixAttempt,
  type MatrixAttempt,
  type MatrixDefinition,
  type RubricBand,
} from '../../../engines/matrix';
import { Icon } from '../../quiz/Icon';
import { SourceLinks, type MatrixSources } from './SourceLinks';

export interface MatrixRubric {
  readonly title: string;
  readonly bands: readonly RubricBand[];
}

function RubricBands({ rubric, points }: { readonly rubric: MatrixRubric; readonly points: number | null }) {
  const max = rubric.bands[0]?.points ?? 0;
  return (
    <ul className="mbands" aria-label={`Рубрика «${rubric.title}»`}>
      {rubric.bands.map((band) => {
        const current = points !== null && band.points === points;
        return (
          <li key={band.points} data-current={current ? '' : undefined}>
            <span className="chip num">{marksOfText(band.points, max)}</span>
            <span>{band.description}</span>
            {current && <Icon name="check" className="icon icon-sm" label="ваш рівень" />}
          </li>
        );
      })}
    </ul>
  );
}

interface LearningDoneProps {
  readonly attempt: MatrixAttempt;
  readonly matrix: MatrixDefinition;
  readonly rubric: MatrixRubric;
  readonly practice: boolean;
  readonly onStartGraded: () => void;
  readonly onRestart: () => void;
}

export function LearningDonePanel({ attempt, matrix, rubric, practice, onStartGraded, onRestart }: LearningDoneProps) {
  const summary = summarizeMatrixAttempt(attempt, matrix);
  return (
    <div className="mpanel" data-matrix-learning-done>
      <p className="summary-score">
        <b className="num">
          {summary.right} з {summary.total}
        </b>
        <span className="muted">правильних зіставлень у навчальній спробі — вона не оцінюється.</span>
      </p>
      {practice ? (
        <>
          <p>Тренувальне проходження завершено. Оцінювану спробу вже зараховано, тож результат не змінюється.</p>
          <div className="tactions">
            <button type="button" className="btn btn-primary" onClick={onRestart} data-matrix-restart>
              Ще раз <Icon name="arrow-r" />
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Далі — оцінювана спроба: ті самі формулювання в новому порядку, розбір з’явиться лише після завершення. Відповіді можна змінювати, доки не завершите.
            Бал за критерієм «{rubric.title}»:
          </p>
          <RubricBands rubric={rubric} points={null} />
          <div className="tactions">
            <button type="button" className="btn btn-primary" onClick={onStartGraded} data-matrix-start-graded>
              Почати оцінювану спробу <Icon name="arrow-r" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface ResultProps {
  readonly attempt: MatrixAttempt;
  readonly matrix: MatrixDefinition;
  readonly sources: MatrixSources;
  readonly rubric: MatrixRubric;
  readonly outcome: string | null;
  readonly onRestart: () => void;
}

export function ResultPanel({ attempt, matrix, sources, rubric, outcome, onRestart }: ResultProps) {
  const summary = summarizeMatrixAttempt(attempt, matrix);
  const mark = rubricMark(rubric.bands, summary.right, summary.total);
  const modelTitle = (id: string | null | undefined) => matrix.models.find((model) => model.id === id)?.title ?? '— без відповіді —';
  return (
    <div className="mpanel" data-matrix-result>
      <p className="summary-score">
        <b className="num" data-matrix-percent>
          {formatPercent(summary.share)}
        </b>
        <span className="muted num">
          {summary.right} з {summary.total} правильно
          {summary.unanswered > 0 ? `, без відповіді ${summary.unanswered}` : ''}
        </span>
      </p>
      <p className="mmark" data-matrix-mark data-points={mark.points}>
        За критерієм «{rubric.title}» — <b>{marksOfText(mark.points, mark.maxPoints)}</b>
      </p>
      <p className="visually-hidden">{matrixSummaryText(summary, mark)}</p>
      <RubricBands rubric={rubric} points={mark.points} />
      <p className="summary-xp" role="status" data-matrix-outcome>
        <Icon name="hex" className="icon summary-hex" />
        {outcome ?? 'XP нараховуються…'}
      </p>

      <h4 className="steps-title">Розбір за ознаками</h4>
      <div className="mreview">
        {matrix.features.map((feature) => {
          const counts = summary.features.find((entry) => entry.featureId === feature.id);
          const group = attempt.groups.find((entry) => entry.featureId === feature.id);
          const perfect = counts !== undefined && counts.right === counts.total;
          return (
            <details key={feature.id} className="mreview-feature" data-feature={feature.id}>
              <summary>
                <Icon name={perfect ? 'check' : 'x'} className="icon icon-sm" label={perfect ? 'без помилок' : 'є помилки'} />
                <span>{feature.title}</span>
                <span className="num faint">
                  {counts?.right ?? 0} з {counts?.total ?? 0}
                </span>
              </summary>
              <ul>
                {(group?.itemIds ?? []).map((itemId) => {
                  const review = reviewItem(attempt, matrix, itemId);
                  return (
                    <li key={itemId} data-state={review.state}>
                      <p className="mreview-statement">{review.statement}</p>
                      <p className="mcard-verdict">
                        <Icon name={review.state === 'right' ? 'check' : 'x'} className="icon icon-sm" label={itemStateLabel(review.state)} />
                        <span>
                          Ваша відповідь: <b>{modelTitle(review.chosenModel)}</b>
                          {review.state !== 'right' && (
                            <>
                              {' '}
                              · правильно: <b>{modelTitle(review.correctModel)}</b>
                            </>
                          )}
                        </span>
                      </p>
                      {review.explanation && <p className="opt-why">{review.explanation}</p>}
                      <SourceLinks ids={review.sources ?? []} sources={sources} />
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
      <div className="tactions">
        <button type="button" className="btn btn-secondary" onClick={onRestart} data-matrix-restart>
          Пройти ще раз для тренування
        </button>
      </div>
    </div>
  );
}

interface RecordedProps {
  readonly share: number;
  readonly total: number;
  readonly rubric: MatrixRubric;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onPractice: () => void;
}

export function RecordedPanel({ share, total, rubric, headingRef, onPractice }: RecordedProps) {
  const right = Math.round(share * total);
  const mark = rubricMark(rubric.bands, Math.min(total, right), total);
  return (
    <div className="mpanel" data-matrix-recorded>
      <h3 className="h4" tabIndex={-1} ref={headingRef}>
        <Icon name="check" className="icon" />
        Оцінювану спробу зараховано
      </h3>
      <p className="mmark num" data-matrix-recorded-result data-points={mark.points}>
        {recordedResultText(share, total, rubric.bands)}
      </p>
      <RubricBands rubric={rubric} points={mark.points} />
      <p className="muted">Оцінюється перша оцінювана спроба. Матрицю можна пройти ще раз для тренування — з розбором, без зміни результату й XP.</p>
      <div className="tactions">
        <button type="button" className="btn btn-primary" onClick={onPractice} data-matrix-practice>
          Тренуватися ще раз <Icon name="arrow-r" />
        </button>
      </div>
    </div>
  );
}
