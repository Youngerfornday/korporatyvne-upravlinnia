/** Підсумок спроби: бали, лічильники станів, нараховані XP, повтор і перегляд відповідей. */
import { eventOutcomeText, type EventOutcome } from '../../engines/gamification';
import { attemptSummaryText, type AttemptSummary as Summary } from '../../engines/quiz';
import { formatPercent } from '../../engines/shared/number-format';
import { Icon } from './Icon';
import { questionsText } from './quiz-texts';

interface Props {
  readonly summary: Summary;
  readonly outcome: EventOutcome | null;
  readonly outcomeError: string | null;
  readonly topicHref: string;
  readonly onRestart: () => void;
  readonly onReview: () => void;
}

export function AttemptSummaryView({ summary, outcome, outcomeError, topicHref, onRestart, onReview }: Props) {
  const total = Object.values(summary.counts).reduce((acc, count) => acc + count, 0);
  const rows = [
    { label: 'Правильно', value: summary.counts.right, state: 'ok' },
    { label: 'Частково', value: summary.counts.partial, state: 'partial' },
    { label: 'Неправильно', value: summary.counts.wrong, state: 'err' },
    { label: 'Без відповіді', value: summary.counts.gaveup + summary.counts.unanswered, state: 'none' },
  ];
  return (
    <section className="qcard summary" aria-labelledby="summary-title" data-quiz-summary>
      <h2 className="h2" id="summary-title" tabIndex={-1} data-summary-heading>
        Спробу завершено
      </h2>
      <p className="summary-score">
        <b className="num">{formatPercent(summary.score, 0)}</b>
        <span className="muted">{attemptSummaryText(summary)}</span>
      </p>
      <ul className="summary-counts" aria-label="Результати за питаннями">
        {rows.map((row) => (
          <li key={row.label} data-state={row.state}>
            <b className="num">{row.value}</b>
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
      <p className="summary-xp" role="status" data-quiz-outcome>
        <Icon name="hex" className="icon summary-hex" />
        {outcome ? eventOutcomeText(outcome) : outcomeError ?? 'XP нараховуються…'}
      </p>
      <p className="muted small">
        Усього {questionsText(total)}. Повторне проходження перемішує питання і варіанти заново; XP нараховуються лише за приріст найкращого результату.
      </p>
      <div className="q-actions">
        <button type="button" className="btn btn-secondary" onClick={onReview}>
          Переглянути відповіді
        </button>
        <div className="right">
          <a className="btn btn-ghost" href={topicHref}>
            До теми
          </a>
          <button type="button" className="btn btn-primary" onClick={onRestart} data-quiz-restart>
            Пройти ще раз <Icon name="arrow-r" />
          </button>
        </div>
      </div>
    </section>
  );
}
