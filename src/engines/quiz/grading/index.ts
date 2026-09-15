import type { GradeResult, Question, QuestionLayout, QuestionResponse, ResponseOf } from '../types';
import { gradeDdwtos, gradeMatching, gradeMultichoice, gradeTrueFalse } from './choice';
import { gradeMultianswer } from './cloze';
import { gradeCalculated, gradeNumerical } from './numeric';
import { GAVE_UP } from './states';

/**
 * Оцінка відповіді так, як це робить Moodle 5.2 у поведінці «відкладений відгук» / «миттєвий відгук»
 * (одна спроба на питання, без штрафів за повтори). Відповідь іншого типу або відсутня — «без відповіді».
 */
export function gradeResponse(question: Question, layout: QuestionLayout, response: QuestionResponse | null): GradeResult {
  if (response === null || response.type !== question.type) return GAVE_UP;
  switch (question.type) {
    case 'multichoice':
      return gradeMultichoice(question, response as ResponseOf<'multichoice'>);
    case 'truefalse':
      return gradeTrueFalse(question, response as ResponseOf<'truefalse'>);
    case 'matching':
      return gradeMatching(question, response as ResponseOf<'matching'>);
    case 'numerical':
      return gradeNumerical(question, response as ResponseOf<'numerical'>);
    case 'calculated':
      return layout.type === 'calculated' ? gradeCalculated(question, layout, response as ResponseOf<'calculated'>) : GAVE_UP;
    case 'ddwtos':
      return gradeDdwtos(question, response as ResponseOf<'ddwtos'>);
    default:
      return gradeMultianswer(question, response as ResponseOf<'multianswer'>);
  }
}

export { stateForFraction } from './states';
export { ddwtosGaps, matchingChoices, type DdwtosGap } from './choice';
export { compareWithWildcard, gradeClozeParts } from './cloze';
export { calculatedAnswerValues, generateDatasetItems } from './numeric';
export { toleranceInterval, withinTolerance, type ToleranceType } from './tolerance';
