import {
  PENALTY_FULL,
  PENALTY_NONE,
  combinedFeedback,
  feedbackField,
  generalFeedbackWith,
  questionHeader,
  type QuestionOf,
} from './question-parts.ts';
import { formatFraction, htmlText, inlineHtml } from './text.ts';
import { cdataElement, element, emptyElement, textElement, type XmlElement } from './xml.ts';

/** Питання з вибором: multichoice, truefalse, matching, ddwtos. Повертають вміст `<question>` без тегів. */

export function multichoiceBody(question: QuestionOf<'multichoice'>): XmlElement[] {
  return [
    ...questionHeader(question, {
      questionText: htmlText(question.stem),
      generalFeedback: htmlText(question.generalFeedback),
      penalty: PENALTY_NONE,
    }),
    textElement('single', question.single ? 'true' : 'false'),
    textElement('shuffleanswers', question.shuffleAnswers ? 'true' : 'false'),
    textElement('answernumbering', question.answerNumbering),
    // Для множинного вибору студент має знати, що правильних кілька: «Виберіть одну або декілька відповідей».
    textElement('showstandardinstruction', question.single ? '0' : '1'),
    ...combinedFeedback('standard'),
    ...(question.single ? [] : [emptyElement('shownumcorrect')]),
    ...question.answers.map((answer) =>
      element('answer', [cdataElement('text', inlineHtml(answer.text)), feedbackField(answer.feedback)], {
        fraction: formatFraction(answer.fraction),
        format: 'html',
      }),
    ),
  ];
}

export function trueFalseBody(question: QuestionOf<'truefalse'>): XmlElement[] {
  const answer = (value: boolean, feedback: string) =>
    element('answer', [textElement('text', String(value)), feedbackField(feedback)], {
      fraction: question.correct === value ? '100' : '0',
      format: 'moodle_auto_format',
    });
  return [
    ...questionHeader(question, {
      questionText: htmlText(question.stem),
      generalFeedback: htmlText(question.generalFeedback),
      penalty: PENALTY_FULL,
    }),
    answer(true, question.feedbackTrue),
    answer(false, question.feedbackFalse),
  ];
}

/** Дистрактор Moodle matching — підпитання з порожнім текстом і лише відповіддю. */
export function matchingBody(question: QuestionOf<'matching'>): XmlElement[] {
  const explanations = question.pairs.flatMap((pair) =>
    pair.feedback ? [{ label: `${pair.prompt} → ${pair.answer}`, feedback: pair.feedback }] : [],
  );
  const subquestion = (prompt: XmlElement, answer: string) =>
    element('subquestion', [prompt, element('answer', [cdataElement('text', inlineHtml(answer))])], { format: 'html' });
  return [
    ...questionHeader(question, {
      questionText: htmlText(question.stem),
      generalFeedback: generalFeedbackWith(question.generalFeedback, explanations),
      penalty: PENALTY_NONE,
    }),
    textElement('shuffleanswers', question.shuffleAnswers ? 'true' : 'false'),
    ...combinedFeedback('standard'),
    emptyElement('shownumcorrect'),
    ...question.pairs.map((pair) => subquestion(cdataElement('text', inlineHtml(pair.prompt)), pair.answer)),
    ...question.distractors.map((distractor) => subquestion(textElement('text', ''), distractor)),
  ];
}

/** Пропуски `[[n]]` лишаються в стовбурі як є; варіант `n` — n-й `<dragbox>`. */
export function ddwtosBody(question: QuestionOf<'ddwtos'>): XmlElement[] {
  const explanations = question.choices.map((choice) => ({ label: choice.text, feedback: choice.feedback }));
  return [
    ...questionHeader(question, {
      questionText: htmlText(question.stem),
      generalFeedback: generalFeedbackWith(question.generalFeedback, explanations),
      penalty: PENALTY_NONE,
    }),
    textElement('shuffleanswers', question.shuffleAnswers ? '1' : '0'),
    ...combinedFeedback('standard'),
    emptyElement('shownumcorrect'),
    ...question.choices.map((choice) =>
      element('dragbox', [
        cdataElement('text', inlineHtml(choice.text)),
        textElement('group', String(choice.group)),
        ...(choice.infinite ? [emptyElement('infinite')] : []),
      ]),
    ),
  ];
}
