/**
 * Пропуски в тексті (ddwtos): замість перетягування — випадний список у кожному пропуску
 * з варіантами тієї самої групи. Після відповіді — текст зі знаками й перелік правильних варіантів.
 */
import type { LayoutOf, QuestionOf, QuestionReview, ResponseOf } from '../../../engines/quiz';
import { ddwtosGaps } from '../../../engines/quiz';
import { Icon } from '../Icon';
import { splitGapStem } from '../stem';

type GapsReview = Extract<QuestionReview, { type: 'ddwtos' }>;

interface Props {
  readonly name: string;
  readonly question: QuestionOf<'ddwtos'>;
  readonly layout: LayoutOf<'ddwtos'>;
  readonly draft: ResponseOf<'ddwtos'> | null;
  readonly review: GapsReview | null;
  readonly onChange: (response: ResponseOf<'ddwtos'>) => void;
}

export function GapsInput({ name, question, layout, draft, review, onChange }: Props) {
  const gaps = ddwtosGaps(question);
  const parts = splitGapStem(question.stem);
  const chosen = draft?.gaps ?? gaps.map(() => null);

  if (review) {
    return (
      <div className="gaps-review">
        <p className="q-stem gaps-stem">
          {parts.map((part, index) =>
            part.kind === 'text' ? (
              <span key={index}>{part.text}</span>
            ) : (
              <span key={index} className="gap-fill" data-state={review.gaps[part.index]?.isCorrect ? 'ok' : 'err'}>
                <Icon name={review.gaps[part.index]?.isCorrect ? 'check' : 'x'} className="icon icon-sm" />
                {review.gaps[part.index]?.selectedText ?? '—'}
              </span>
            ),
          )}
        </p>
        <ol className="gaps-list">
          {review.gaps.map((gap) => (
            <li key={gap.index} data-state={gap.isCorrect ? 'ok' : 'err'}>
              <span className="visually-hidden">Пропуск {gap.index + 1}: {gap.isCorrect ? 'правильно' : 'неправильно'}. </span>
              <b>{gap.correctText}</b>
              {gap.feedback && <span className="opt-why">{gap.feedback}</span>}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const select = (gapIndex: number, value: string) => {
    const next = chosen.map((current, index) => (index === gapIndex ? (value === '' ? null : Number(value)) : current));
    onChange({ type: 'ddwtos', gaps: next });
  };

  return (
    <p className="q-stem gaps-stem">
      {parts.map((part, index) => {
        if (part.kind === 'text') return <span key={index}>{part.text}</span>;
        const gap = gaps[part.index];
        const options = layout.choiceOrder.filter((choiceIndex) => question.choices[choiceIndex]?.group === gap?.group);
        return (
          <select
            key={index}
            className="select gap-select"
            aria-label={`Пропуск ${part.index + 1}`}
            value={chosen[part.index] ?? ''}
            onChange={(event) => select(part.index, event.target.value)}
          >
            <option value="">…</option>
            {options.map((choiceIndex) => (
              <option key={choiceIndex} value={choiceIndex}>
                {question.choices[choiceIndex]?.text}
              </option>
            ))}
          </select>
        );
      })}
      <span className="visually-hidden" id={`${name}-gaps-note`}>
        Оберіть варіант для кожного пропуску зі списку.
      </span>
    </p>
  );
}
