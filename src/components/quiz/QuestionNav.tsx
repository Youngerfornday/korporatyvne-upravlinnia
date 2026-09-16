/** Навігатор питань: комірки-реєстр зі знаком результату, позначкою й поточним питанням. */
import type { QuizSlot } from '../../engines/quiz';
import { Icon } from './Icon';
import { STATE_SHORT } from './quiz-texts';

interface Props {
  readonly slots: readonly QuizSlot[];
  readonly current: number;
  readonly flagged: ReadonlySet<number>;
  readonly onSelect: (index: number) => void;
}

function cellState(slot: QuizSlot): 'ok' | 'err' | 'partial' | undefined {
  switch (slot.grade?.state) {
    case 'right':
      return 'ok';
    case 'partial':
      return 'partial';
    case 'wrong':
    case 'gaveup':
      return 'err';
    default:
      return undefined;
  }
}

export function QuestionNav({ slots, current, flagged, onSelect }: Props) {
  return (
    <nav className="navq" aria-label="Навігація питаннями">
      <h2>Питання</h2>
      <div className="cells">
        {slots.map((slot, index) => {
          const state = cellState(slot);
          const label = [
            `Питання ${index + 1}`,
            slot.grade ? STATE_SHORT[slot.grade.state] : 'без відповіді',
            flagged.has(index) ? 'позначено' : null,
            index === current ? 'поточне' : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={index}
              type="button"
              className="cell"
              data-state={state}
              data-flag={flagged.has(index) ? '' : undefined}
              aria-current={index === current ? 'true' : undefined}
              aria-label={label}
              onClick={() => onSelect(index)}
            >
              {index + 1}
              {state && <Icon name={state === 'err' ? 'x' : 'check'} />}
              {flagged.has(index) && <Icon name="flag" className="icon cell-flag" />}
            </button>
          );
        })}
      </div>
      <div className="navq-legend">
        <span>
          <i className="ok" />
          правильно
        </span>
        <span>
          <i className="partial" />
          частково
        </span>
        <span>
          <i className="err" />
          неправильно
        </span>
        <span>
          <i />
          без відповіді
        </span>
      </div>
    </nav>
  );
}
