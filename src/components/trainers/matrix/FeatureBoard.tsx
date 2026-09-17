/**
 * Дошка однієї ознаки: навігатор ознак, зони моделей для перетягування (лише вказівник) і картки формулювань
 * з вибором моделі зі списку — доступна альтернатива перетягуванню для клавіатури, скрінрідера і дотику.
 */
import { useState, type DragEvent, type RefObject } from 'react';
import { itemStateLabel, reviewItem, type MatrixAttempt, type MatrixDefinition, type MatrixItemReview } from '../../../engines/matrix';
import { Icon } from '../../quiz/Icon';
import { SourceLinks, type MatrixSources } from './SourceLinks';

const DRAG_TYPE = 'text/plain';

interface NavProps {
  readonly attempt: MatrixAttempt;
  readonly matrix: MatrixDefinition;
  readonly current: number;
  readonly onSelect: (index: number) => void;
}

function featureState(attempt: MatrixAttempt, matrix: MatrixDefinition, index: number): { readonly state: string; readonly label: string } {
  const group = attempt.groups[index];
  if (!group) return { state: 'empty', label: '' };
  const reviews = group.itemIds.map((itemId) => reviewItem(attempt, matrix, itemId));
  const answered = reviews.filter((review) => review.chosenModel !== null).length;
  if (reviews.every((review) => review.revealed)) {
    const right = reviews.filter((review) => review.state === 'right').length;
    return { state: right === reviews.length ? 'ok' : 'checked', label: `перевірено, правильно ${right} з ${reviews.length}` };
  }
  if (answered === reviews.length) return { state: 'answered', label: 'усі формулювання зіставлено' };
  if (answered > 0) return { state: 'partial', label: `зіставлено ${answered} з ${reviews.length}` };
  return { state: 'empty', label: 'не розпочато' };
}

function FeatureNav({ attempt, matrix, current, onSelect }: NavProps) {
  return (
    <nav className="mnav" aria-label="Ознаки матриці">
      <ol>
        {attempt.groups.map((group, index) => {
          const title = matrix.features.find((feature) => feature.id === group.featureId)?.title ?? '';
          const { state, label } = featureState(attempt, matrix, index);
          return (
            <li key={group.featureId}>
              <button
                type="button"
                className="cell mnav-cell"
                data-state={state}
                aria-current={index === current ? 'step' : undefined}
                aria-label={`Ознака ${index + 1}: ${title}, ${label}`}
                onClick={() => onSelect(index)}
                data-matrix-nav={index}
              >
                <span aria-hidden="true">{index + 1}</span>
                {state === 'ok' && <Icon name="check" />}
                {state === 'checked' && <Icon name="x" />}
                {(state === 'answered' || state === 'partial') && <i className="mnav-dot" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface CardProps {
  readonly review: MatrixItemReview;
  readonly position: number;
  readonly total: number;
  readonly idBase: string;
  readonly matrix: MatrixDefinition;
  readonly sources: MatrixSources;
  readonly locked: boolean;
  readonly onSelect: (modelId: string | null) => void;
}

function modelTitle(matrix: MatrixDefinition, modelId: string | undefined | null): string {
  return matrix.models.find((model) => model.id === modelId)?.title ?? '';
}

function StatementCard({ review, position, total, idBase, matrix, sources, locked, onSelect }: CardProps) {
  const textId = `${idBase}-text`;
  const selectId = `${idBase}-model`;
  const onDragStart = (event: DragEvent<HTMLLIElement>) => {
    event.dataTransfer.setData(DRAG_TYPE, String(position));
    event.dataTransfer.effectAllowed = 'move';
  };
  const verdict =
    review.state === 'right'
      ? 'Правильно'
      : review.state === 'wrong'
        ? `Неправильно: це ${modelTitle(matrix, review.correctModel).toLocaleLowerCase('uk-UA')}`
        : `Без відповіді: це ${modelTitle(matrix, review.correctModel).toLocaleLowerCase('uk-UA')}`;
  return (
    <li className="mcard card" data-state={review.state} data-revealed={review.revealed ? '' : undefined} draggable={!locked} onDragStart={locked ? undefined : onDragStart} data-matrix-card={position}>
      <div className="mcard-head">
        <span className="mcard-n num" aria-hidden="true">
          {position + 1}
        </span>
        <p className="mcard-text" id={textId}>
          {review.statement}
        </p>
      </div>
      <div className="mcard-control">
        <label htmlFor={selectId} className="mcard-label">
          Модель<span className="visually-hidden"> для формулювання {position + 1} з {total}</span>
        </label>
        <select
          id={selectId}
          className="select"
          value={review.chosenModel ?? ''}
          disabled={locked}
          aria-describedby={textId}
          data-matrix-select={position}
          onChange={(event) => onSelect(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">— оберіть модель —</option>
          {matrix.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.title}
            </option>
          ))}
        </select>
      </div>
      {review.revealed && (
        <div className="mcard-review" data-matrix-review>
          <p className="mcard-verdict">
            <Icon name={review.state === 'right' ? 'check' : 'x'} className="icon icon-sm" label={itemStateLabel(review.state)} />
            <b>{verdict}</b>
          </p>
          {review.explanation && <p className="opt-why">{review.explanation}</p>}
          <SourceLinks ids={review.sources ?? []} sources={sources} />
        </div>
      )}
    </li>
  );
}

export interface FeatureBoardProps {
  readonly attempt: MatrixAttempt;
  readonly matrix: MatrixDefinition;
  readonly sources: MatrixSources;
  readonly featureIndex: number;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onSelect: (itemId: string, modelId: string | null) => void;
  readonly onNavigate: (index: number) => void;
}

export function FeatureBoard({ attempt, matrix, sources, featureIndex, headingRef, onSelect, onNavigate }: FeatureBoardProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const group = attempt.groups[featureIndex];
  if (!group) return null;
  const feature = matrix.features.find((candidate) => candidate.id === group.featureId);
  const reviews = group.itemIds.map((itemId) => reviewItem(attempt, matrix, itemId));
  const locked = attempt.status === 'finished' || attempt.checkedFeatures.includes(group.featureId);

  const drop = (modelId: string) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropTarget(null);
    const position = Number.parseInt(event.dataTransfer.getData(DRAG_TYPE), 10);
    const itemId = group.itemIds[position];
    if (!locked && itemId) onSelect(itemId, modelId);
  };

  return (
    <div className="mboard" data-matrix-board data-feature-index={featureIndex}>
      <FeatureNav attempt={attempt} matrix={matrix} current={featureIndex} onSelect={onNavigate} />
      <h4 className="mfeature" tabIndex={-1} ref={headingRef} data-matrix-feature>
        <span className="faint num">
          Ознака {featureIndex + 1} з {attempt.groups.length}.
        </span>{' '}
        {feature?.title}
      </h4>
      <p className="mhint">Перетягніть картку на модель або оберіть модель у списку під карткою.</p>

      <div className="mzones" aria-hidden="true">
        {matrix.models.map((model) => {
          const assigned = reviews.map((review, index) => (review.chosenModel === model.id ? index + 1 : null)).filter((value): value is number => value !== null);
          return (
            <div
              key={model.id}
              className="mzone"
              data-drop-model={model.id}
              data-over={dropTarget === model.id ? '' : undefined}
              data-locked={locked ? '' : undefined}
              onDragOver={(event) => {
                if (locked) return;
                event.preventDefault();
                setDropTarget(model.id);
              }}
              onDragLeave={() => setDropTarget((current) => (current === model.id ? null : current))}
              onDrop={drop(model.id)}
            >
              <b>{model.short}</b>
              <span className="num">{assigned.length > 0 ? `картки ${assigned.join(', ')}` : 'перетягніть сюди'}</span>
            </div>
          );
        })}
      </div>

      <ol className="mcards">
        {reviews.map((review, position) => (
          <StatementCard
            key={review.itemId}
            review={review}
            position={position}
            total={reviews.length}
            idBase={`matrix-${attempt.mode}-${featureIndex}-${position}`}
            matrix={matrix}
            sources={sources}
            locked={locked}
            onSelect={(modelId) => onSelect(review.itemId, modelId)}
          />
        ))}
      </ol>
    </div>
  );
}
