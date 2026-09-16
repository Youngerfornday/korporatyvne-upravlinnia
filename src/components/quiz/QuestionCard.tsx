/** Картка одного питання: стовбур, поле відповіді за типом, вердикт, загальний відгук і норма права. */
import { useEffect, useRef } from 'react';
import type { LayoutOf, Question, QuestionResponse, QuestionReview, QuizSlot, ResponseOf } from '../../engines/quiz';
import { reviewQuestion } from '../../engines/quiz';
import { Icon } from './Icon';
import { ClozeInput } from './inputs/ClozeInput';
import { MultichoiceInput, TrueFalseInput } from './inputs/ChoiceInputs';
import { GapsInput } from './inputs/GapsInput';
import { MatchingInput } from './inputs/MatchingInput';
import { NumericInput } from './inputs/NumericInput';
import { BLOOM_LABELS, VERDICT_HEADING, marksOfText, marksText, questionTypeLabel } from './quiz-texts';
import { substituteWildcards } from './stem';

export interface QuestionCardProps {
  readonly index: number;
  readonly total: number;
  readonly question: Question;
  readonly slot: QuizSlot;
  readonly draft: QuestionResponse | undefined;
  readonly issue: string | null;
  /** Після завершення спроби картка лише для перегляду. */
  readonly readOnly: boolean;
  readonly topicHref: string;
  readonly onDraft: (response: QuestionResponse) => void;
}

const VERDICT_CLASS = { right: 'is-ok', partial: 'is-partial', wrong: 'is-err', gaveup: 'is-err' } as const;

function draftOf<T extends Question['type']>(draft: QuestionResponse | undefined, type: T): ResponseOf<T> | null {
  return draft?.type === type ? (draft as ResponseOf<T>) : null;
}

function reviewOf<T extends QuestionReview['type']>(review: QuestionReview | null, type: T): Extract<QuestionReview, { type: T }> | null {
  return review?.type === type ? (review as Extract<QuestionReview, { type: T }>) : null;
}

function AnswerField({ question, slot, draft, review, name, stemId, issueId, onDraft }: {
  readonly question: Question;
  readonly slot: QuizSlot;
  readonly draft: QuestionResponse | undefined;
  readonly review: QuestionReview | null;
  readonly name: string;
  readonly stemId: string;
  readonly issueId: string | undefined;
  readonly onDraft: (response: QuestionResponse) => void;
}) {
  switch (question.type) {
    case 'multichoice':
      return (
        <MultichoiceInput name={name} labelledBy={stemId} question={question} layout={slot.layout as LayoutOf<'multichoice'>} draft={draftOf(draft, 'multichoice')} review={reviewOf(review, 'multichoice')} onChange={onDraft} />
      );
    case 'truefalse':
      return <TrueFalseInput name={name} labelledBy={stemId} draft={draftOf(draft, 'truefalse')} review={reviewOf(review, 'truefalse')} onChange={onDraft} />;
    case 'matching':
      return <MatchingInput name={name} question={question} layout={slot.layout as LayoutOf<'matching'>} draft={draftOf(draft, 'matching')} review={reviewOf(review, 'matching')} onChange={onDraft} />;
    case 'numerical':
      return <NumericInput name={name} type="numerical" draft={draftOf(draft, 'numerical')} review={reviewOf(review, 'numerical')} issueId={issueId} onChange={onDraft} />;
    case 'calculated':
      return <NumericInput name={name} type="calculated" draft={draftOf(draft, 'calculated')} review={reviewOf(review, 'calculated')} issueId={issueId} onChange={onDraft} />;
    case 'ddwtos':
      return <GapsInput name={name} question={question} layout={slot.layout as LayoutOf<'ddwtos'>} draft={draftOf(draft, 'ddwtos')} review={reviewOf(review, 'ddwtos')} onChange={onDraft} />;
    default:
      return <ClozeInput name={name} question={question} layout={slot.layout as LayoutOf<'multianswer'>} draft={draftOf(draft, 'multianswer')} review={reviewOf(review, 'multianswer')} onChange={onDraft} />;
  }
}

export function QuestionCard({ index, total, question, slot, draft, issue, readOnly, topicHref, onDraft }: QuestionCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answered = slot.response !== null || readOnly;
  const review = answered ? reviewQuestion(question, slot.layout, slot.response) : null;
  const name = `q${index}`;
  const stemId = `${name}-stem`;
  const issueId = issue ? `${name}-issue` : undefined;
  const stemInline = question.type === 'ddwtos' || question.type === 'multianswer';
  const stemText = question.type === 'calculated' ? substituteWildcards(question.stem, (slot.layout as LayoutOf<'calculated'>).values) : question.stem;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, [index]);

  return (
    <section className="qcard" aria-labelledby={`${name}-title`}>
      <h2 className="q-title" id={`${name}-title`} ref={headingRef} tabIndex={-1}>
        <span className="q-label">
          <span>
            Питання {index + 1} із {total} · {questionTypeLabel(question)} · {marksText(question.defaultMark)}
          </span>
          <span className="chip chip-tint">{BLOOM_LABELS[question.bloom]}</span>
        </span>
      </h2>
      {stemInline ? (
        <span id={stemId} className="visually-hidden">
          Питання {index + 1}
        </span>
      ) : (
        <p className="q-stem" id={stemId}>
          {stemText}
        </p>
      )}

      <AnswerField question={question} slot={slot} draft={draft} review={review} name={name} stemId={stemId} issueId={issueId} onDraft={onDraft} />

      {issue && (
        <p className="q-issue" id={issueId} role="alert">
          <Icon name="alert" className="icon icon-sm" />
          {issue}
        </p>
      )}

      {review && (
        <>
          <div className={`verdict ${VERDICT_CLASS[review.grade.state]}`} data-show="" role="status">
            <Icon name={review.grade.state === 'right' ? 'check' : 'x'} />
            <div>
              <strong>
                {VERDICT_HEADING[review.grade.state]}. {marksOfText(review.grade.fraction * slot.maxMark, slot.maxMark)}
              </strong>
              {review.generalFeedback}
            </div>
          </div>
          {question.lawRef.length > 0 && (
            <div className="q-hint" data-show="">
              <Icon name="scale" className="icon icon-sm" />
              <span>
                Норма: {question.lawRef.map((ref) => `${ref.article} ${ref.act}`).join('; ')}.{' '}
                <a href={topicHref}>
                  Повернутися до теми <Icon name="arrow-r" className="icon icon-sm" />
                </a>
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
