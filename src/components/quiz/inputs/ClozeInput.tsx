/** Cloze (multianswer): поля прямо в тексті — список, коротка відповідь або число; після відповіді — розбір частин. */
import type { LayoutOf, QuestionOf, QuestionReview, ResponseOf } from '../../../engines/quiz';
import { Icon } from '../Icon';
import { NUMBER_HINT } from '../quiz-texts';
import { splitClozeStem } from '../stem';

type ClozeReview = Extract<QuestionReview, { type: 'multianswer' }>;

interface Props {
  readonly name: string;
  readonly question: QuestionOf<'multianswer'>;
  readonly layout: LayoutOf<'multianswer'>;
  readonly draft: ResponseOf<'multianswer'> | null;
  readonly review: ClozeReview | null;
  readonly onChange: (response: ResponseOf<'multianswer'>) => void;
}

export function ClozeInput({ name, question, layout, draft, review, onChange }: Props) {
  const parts = splitClozeStem(question.stem);
  const values = draft?.parts ?? question.subquestions.map(() => null);
  const hasNumeric = question.subquestions.some((sub) => sub.kind === 'numerical');
  const hintId = `${name}-hint`;

  if (review) {
    return (
      <div className="cloze-review">
        <p className="q-stem gaps-stem">
          {parts.map((part, index) => {
            if (part.kind === 'text') return <span key={index}>{part.text}</span>;
            const item = review.parts[part.index];
            const ok = item?.grade?.state === 'right';
            return (
              <span key={index} className="gap-fill" data-state={ok ? 'ok' : 'err'}>
                <Icon name={ok ? 'check' : 'x'} className="icon icon-sm" />
                {item?.given ?? '—'}
              </span>
            );
          })}
        </p>
        <ol className="gaps-list">
          {review.parts.map((part) => {
            const ok = part.grade?.state === 'right';
            return (
              <li key={part.index} data-state={ok ? 'ok' : 'err'}>
                <span className="visually-hidden">Частина {part.index + 1}: {ok ? 'правильно' : 'неправильно'}. </span>
                <b>{part.correctText}</b>
                {part.feedback && <span className="opt-why">{part.feedback}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const update = (partIndex: number, value: number | string | null) => {
    onChange({ type: 'multianswer', parts: values.map((current, index) => (index === partIndex ? value : current)) });
  };

  return (
    <div>
      <p className="q-stem gaps-stem">
        {parts.map((part, index) => {
          if (part.kind === 'text') return <span key={index}>{part.text}</span>;
          const sub = question.subquestions[part.index];
          if (!sub) return null;
          const label = `Частина ${part.index + 1}`;
          const value = values[part.index];
          if (sub.kind === 'multichoice') {
            const order = layout.partOrders[part.index] ?? sub.answers.map((_, answerIndex) => answerIndex);
            return (
              <select key={index} className="select gap-select" aria-label={label} value={typeof value === 'number' ? value : ''} onChange={(event) => update(part.index, event.target.value === '' ? null : Number(event.target.value))}>
                <option value="">…</option>
                {order.map((answerIndex) => (
                  <option key={answerIndex} value={answerIndex}>
                    {sub.answers[answerIndex]?.text}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              key={index}
              className="input gap-input num"
              type="text"
              inputMode={sub.kind === 'numerical' ? 'decimal' : 'text'}
              autoComplete="off"
              aria-label={label}
              aria-describedby={sub.kind === 'numerical' ? hintId : undefined}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => update(part.index, event.target.value)}
            />
          );
        })}
      </p>
      {hasNumeric && (
        <p id={hintId} className="faint small">
          {NUMBER_HINT}
        </p>
      )}
    </div>
  );
}
