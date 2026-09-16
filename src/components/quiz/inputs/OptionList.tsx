/**
 * Список варіантів з літерами в колах: до відповіді — radio/checkbox у <label class="opt">,
 * після — розбір із знаком і поясненням під кожним варіантом (стан не лише кольором).
 */
import { Icon } from '../Icon';
import { OPTION_LETTERS } from '../quiz-texts';

export interface OptionItem {
  readonly key: string;
  readonly text: string;
  readonly checked: boolean;
  /** Лише в режимі розбору. */
  readonly isCorrect?: boolean;
  readonly feedback?: string;
}

interface Props {
  readonly name: string;
  readonly multiple: boolean;
  readonly labelledBy: string;
  readonly options: readonly OptionItem[];
  readonly answered: boolean;
  readonly onToggle: (key: string, checked: boolean) => void;
}

export function OptionList({ name, multiple, labelledBy, options, answered, onToggle }: Props) {
  return (
    <div className="options" role="group" aria-labelledby={labelledBy} data-answered={answered ? '' : undefined}>
      {options.map((option, index) => {
        const letter = OPTION_LETTERS[index] ?? String(index + 1);
        if (answered) {
          const status = option.isCorrect ? 'правильний варіант' : option.checked ? 'ваш вибір, неправильно' : 'неправильний варіант';
          return (
            <div key={option.key} className="opt" data-correct={option.isCorrect ? '' : undefined} data-chosen={option.checked ? '' : undefined}>
              <span className="opt-key" aria-hidden="true">
                {letter}
              </span>
              <span className="opt-text">
                <span className="visually-hidden">{status}: </span>
                {option.text}
              </span>
              <Icon name={option.isCorrect ? 'check' : 'x'} className="icon opt-mark" />
              {option.feedback && <span className="opt-why">{option.feedback}</span>}
            </div>
          );
        }
        const id = `${name}-${option.key}`;
        return (
          <label key={option.key} className="opt opt-input" htmlFor={id} data-checked={option.checked ? '' : undefined}>
            <input
              id={id}
              className="visually-hidden"
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              checked={option.checked}
              onChange={(event) => onToggle(option.key, event.target.checked)}
            />
            <span className="opt-key" aria-hidden="true">
              {letter}
            </span>
            <span className="opt-text">{option.text}</span>
          </label>
        );
      })}
    </div>
  );
}
