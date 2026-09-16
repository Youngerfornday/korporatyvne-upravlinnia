/** Числова відповідь і розрахунок: текстове поле з десятковою клавіатурою та підказкою про кому. */
import type { QuestionReview, ResponseOf } from '../../../engines/quiz';
import { Icon } from '../Icon';
import { NUMBER_HINT } from '../quiz-texts';

type NumericReview = Extract<QuestionReview, { type: 'numerical' | 'calculated' }>;
type NumericResponse = ResponseOf<'numerical'> | ResponseOf<'calculated'>;

interface Props {
  readonly name: string;
  readonly type: 'numerical' | 'calculated';
  readonly draft: NumericResponse | null;
  readonly review: NumericReview | null;
  readonly issueId: string | undefined;
  readonly onChange: (response: NumericResponse) => void;
}

export function NumericInput({ name, type, draft, review, issueId, onChange }: Props) {
  const hintId = `${name}-hint`;
  if (review) {
    const isRight = review.grade.state === 'right';
    return (
      <div className="numeric-review" data-state={isRight ? 'ok' : 'err'}>
        <p>
          <Icon name={isRight ? 'check' : 'x'} className="icon icon-sm" label={isRight ? 'правильно' : 'неправильно'} />
          <span>Ваша відповідь: </span>
          <b className="num">{review.given ?? '— без відповіді —'}</b>
        </p>
        {!isRight && (
          <p>
            Правильна відповідь: <b className="num">{review.correctAnswerText}</b>
          </p>
        )}
        {review.feedback && <p className="opt-why">{review.feedback}</p>}
      </div>
    );
  }
  return (
    <div className="field numeric-field">
      <label htmlFor={name}>Відповідь</label>
      <input
        id={name}
        className="input num"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft?.answer ?? ''}
        aria-describedby={issueId ? `${hintId} ${issueId}` : hintId}
        aria-invalid={issueId ? true : undefined}
        onChange={(event) => onChange({ type, answer: event.target.value })}
      />
      <span id={hintId} className="faint small">
        {NUMBER_HINT}
      </span>
    </div>
  );
}
