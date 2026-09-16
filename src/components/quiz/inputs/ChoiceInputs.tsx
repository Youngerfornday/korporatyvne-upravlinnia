/** Одиночний і множинний вибір, «правда чи неправда» — поверх OptionList. */
import type { LayoutOf, QuestionOf, QuestionReview, ResponseOf } from '../../../engines/quiz';
import { OptionList } from './OptionList';

type MultichoiceReview = Extract<QuestionReview, { type: 'multichoice' }>;
type TrueFalseReview = Extract<QuestionReview, { type: 'truefalse' }>;

interface MultichoiceProps {
  readonly name: string;
  readonly labelledBy: string;
  readonly question: QuestionOf<'multichoice'>;
  readonly layout: LayoutOf<'multichoice'>;
  readonly draft: ResponseOf<'multichoice'> | null;
  readonly review: MultichoiceReview | null;
  readonly onChange: (response: ResponseOf<'multichoice'>) => void;
}

export function MultichoiceInput({ name, labelledBy, question, layout, draft, review, onChange }: MultichoiceProps) {
  const selected = draft?.selected ?? [];
  const options = review
    ? review.options.map((option) => ({
        key: String(option.index),
        text: option.text,
        checked: option.selected,
        isCorrect: option.isCorrect,
        feedback: option.feedback,
      }))
    : layout.order.map((index) => ({ key: String(index), text: question.answers[index]?.text ?? '', checked: selected.includes(index) }));

  const toggle = (key: string, checked: boolean) => {
    const index = Number(key);
    if (question.single) {
      onChange({ type: 'multichoice', selected: [index] });
      return;
    }
    const next = checked ? [...selected.filter((value) => value !== index), index] : selected.filter((value) => value !== index);
    onChange({ type: 'multichoice', selected: next });
  };

  return <OptionList name={name} multiple={!question.single} labelledBy={labelledBy} options={options} answered={review !== null} onToggle={toggle} />;
}

interface TrueFalseProps {
  readonly name: string;
  readonly labelledBy: string;
  readonly draft: ResponseOf<'truefalse'> | null;
  readonly review: TrueFalseReview | null;
  readonly onChange: (response: ResponseOf<'truefalse'>) => void;
}

const TRUE_FALSE_OPTIONS = [
  { key: 'true', value: true, text: 'Правда' },
  { key: 'false', value: false, text: 'Неправда' },
] as const;

export function TrueFalseInput({ name, labelledBy, draft, review, onChange }: TrueFalseProps) {
  const options = review
    ? review.options.map((option) => ({
        key: String(option.value),
        text: option.label,
        checked: option.selected,
        isCorrect: option.isCorrect,
        feedback: option.feedback,
      }))
    : TRUE_FALSE_OPTIONS.map((option) => ({ key: option.key, text: option.text, checked: draft?.value === option.value }));

  return (
    <OptionList
      name={name}
      multiple={false}
      labelledBy={labelledBy}
      options={options}
      answered={review !== null}
      onToggle={(key) => onChange({ type: 'truefalse', value: key === 'true' })}
    />
  );
}
