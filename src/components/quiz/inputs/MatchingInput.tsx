/** Відповідність: для кожного елемента — випадний список відповідей (клавіатура і скрінрідер працюють нативно). */
import type { LayoutOf, QuestionOf, QuestionReview, ResponseOf } from '../../../engines/quiz';
import { matchingChoices } from '../../../engines/quiz';
import { Icon } from '../Icon';

type MatchingReview = Extract<QuestionReview, { type: 'matching' }>;

interface Props {
  readonly name: string;
  readonly question: QuestionOf<'matching'>;
  readonly layout: LayoutOf<'matching'>;
  readonly draft: ResponseOf<'matching'> | null;
  readonly review: MatchingReview | null;
  readonly onChange: (response: ResponseOf<'matching'>) => void;
}

export function MatchingInput({ name, question, layout, draft, review, onChange }: Props) {
  const choices = matchingChoices(question);
  const selections = draft?.selections ?? question.pairs.map(() => null);

  if (review) {
    return (
      <ul className="match-list match-review">
        {review.items.map((item) => (
          <li key={item.index} className="match-row" data-state={item.isCorrect ? 'ok' : 'err'}>
            <span className="match-prompt">{item.prompt}</span>
            <span className="match-answer">
              <Icon name={item.isCorrect ? 'check' : 'x'} className="icon icon-sm" label={item.isCorrect ? 'правильно' : 'неправильно'} />
              <span>{item.selectedText ?? '— без відповіді —'}</span>
              {!item.isCorrect && <span className="match-correct">Правильно: {item.correctText}</span>}
              {item.feedback && <span className="opt-why">{item.feedback}</span>}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const select = (pairIndex: number, value: string) => {
    const next = selections.map((selection, index) => (index === pairIndex ? (value === '' ? null : Number(value)) : selection));
    onChange({ type: 'matching', selections: next });
  };

  return (
    <ul className="match-list">
      {layout.stemOrder.map((pairIndex) => {
        const pair = question.pairs[pairIndex];
        if (!pair) return null;
        const id = `${name}-pair-${pairIndex}`;
        return (
          <li key={pairIndex} className="match-row">
            <label className="match-prompt" htmlFor={id}>
              {pair.prompt}
            </label>
            <select id={id} className="select" value={selections[pairIndex] ?? ''} onChange={(event) => select(pairIndex, event.target.value)}>
              <option value="">— оберіть —</option>
              {layout.choiceOrder.map((choiceIndex) => (
                <option key={choiceIndex} value={choiceIndex}>
                  {choices[choiceIndex]}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}
