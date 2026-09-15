/**
 * Рушій тренувального тесту, що оцінює так само, як Moodle 5.2 (MOODLE_502_STABLE, звірено з кодом
 * question/type/* і описами типів на docs.moodle.org), щоб бали на сайті й у Moodle збігалися.
 *
 * Відповідність за типами (частка питання → бал = частка × максимальний бал слота):
 * - multichoice, один варіант — частка вибраного варіанта; від’ємна (штраф) не обрізається.
 * - multichoice, кілька — сума часток вибраних, обмежена [0, 1].
 * - truefalse — 1 або 0.
 * - matching — правильні пари / усі пари; однакові тексти відповідей зливаються в один варіант.
 * - numerical — перша відповідь банку, у номінальний допуск якої потрапило число (з епсилон PHP 1e-14);
 *   від’ємна частка → 0; «1,5», «1.5», «1 234,5», «1,5e3» читаються як в apply_units.
 * - calculated — те саме на значеннях варіанта набору даних; допуск відносний/номінальний/геометричний
 *   до НЕокругленого значення формули; округлення correctAnswerLength — лише для показу.
 * - ddwtos — правильно заповнені пропуски / усі пропуски.
 * - multianswer (Cloze) — Σ(частка підпитання × вага) / Σ ваг; порожні частини дають 0.
 * - Стан: right > 0.999999, wrong < 0.000001, інакше partial; без відповіді — gaveup (0).
 * - Підсумок: Σ балів без обмеження знизу (як quiz_rescale_grade), відсотки — 2 знаки.
 *
 * Можливі розбіжності з Moodle: (1) кома: Moodle прибирає лише пробіл і розділювач тисяч мовного пакета,
 * ми — ще нерозривні пробіли з uk-UA; (2) набори даних calculated генеруються нашим seeded RNG — щоб
 * значення збіглися, експортер має вивантажити в Moodle XML саме `generateDatasetItems`; (3) показ
 * правильної відповіді в значущих цифрах спрощено (оцінювання не зачіпає); (4) номер варіанта й порядок
 * перемішування обирає наш RNG, а не Moodle; (5) штрафи за повторні спроби (interactive) не моделюються —
 * лише одна спроба на питання.
 */
export { answerQuestion, finishAttempt, startAttempt } from './attempt';
export type { AttemptError, AttemptErrorCode, AttemptMode, QuizAttempt, QuizSlot, StartAttemptOptions } from './attempt';
export { compileFormula, evaluateFormula, validateFormula } from './formula';
export type { CompiledFormula, FormulaError, FormulaErrorCode, ValidateFormulaOptions } from './formula';
export {
  calculatedAnswerValues,
  compareWithWildcard,
  ddwtosGaps,
  generateDatasetItems,
  gradeResponse,
  matchingChoices,
  stateForFraction,
  toleranceInterval,
  withinTolerance,
} from './grading';
export type { DdwtosGap, ToleranceType } from './grading';
export { createLayout, type LayoutOptions } from './layout';
export { attemptSummaryText, summarizeAttempt, toScormCmiValues, toScormReport } from './report';
export type { AttemptSummary, ScormCmiKey, ScormLessonStatus, ScormReport, ScormReportOptions } from './report';
export { reviewQuestion } from './review';
export type {
  ChoiceOptionReview,
  ClozePartReview,
  GapReview,
  MatchingItemReview,
  NumericReview,
  QuestionReview,
  TrueFalseOptionReview,
} from './review';
export { QUESTION_STATE_LABELS, questionStateLabel } from './texts';
export type * from './types';
export { RESPONSE_ISSUE_MESSAGES, validateResponse, type ResponseIssue, type ResponseIssueCode } from './validation';
