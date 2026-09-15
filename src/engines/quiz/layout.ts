import { randomInt, shuffled, type RandomSource } from '../shared/random';
import { matchingChoices } from './grading/choice';
import { generateDatasetItems } from './grading/numeric';
import type { Question, QuestionLayout } from './types';

export interface LayoutOptions {
  /** Налаштування тесту Moodle «Перемішувати варіанти відповідей»; діє разом із прапорцем питання. */
  readonly shuffleWithinQuestions: boolean;
}

const DEFAULT_OPTIONS: LayoutOptions = { shuffleWithinQuestions: true };

function indices(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function maybeShuffled(length: number, shouldShuffle: boolean, random: RandomSource): number[] {
  return shouldShuffle ? shuffled(indices(length), random) : indices(length);
}

/** Групи ddwtos за зростанням номера; усередині групи — перемішано (qtype_gapselect start_attempt). */
function ddwtosOrder(groups: readonly number[], shouldShuffle: boolean, random: RandomSource): number[] {
  const distinct = [...new Set(groups)].sort((a, b) => a - b);
  return distinct.flatMap((group) => {
    const members = indices(groups.length).filter((index) => groups[index] === group);
    return shouldShuffle ? shuffled(members, random) : members;
  });
}

/** Розкладка питання для нової спроби: порядок варіантів і номер варіанта calculated. */
export function createLayout(question: Question, random: RandomSource, options: LayoutOptions = DEFAULT_OPTIONS): QuestionLayout {
  const allowShuffle = options.shuffleWithinQuestions;
  switch (question.type) {
    case 'multichoice':
      return { type: 'multichoice', order: maybeShuffled(question.answers.length, allowShuffle && question.shuffleAnswers, random) };
    case 'truefalse':
      return { type: 'truefalse' };
    case 'matching':
      return {
        type: 'matching',
        stemOrder: maybeShuffled(question.pairs.length, allowShuffle && question.shuffleAnswers, random),
        // qtype_match перемішує список відповідей завжди, незалежно від налаштувань.
        choiceOrder: shuffled(indices(matchingChoices(question).length), random),
      };
    case 'numerical':
      return { type: 'numerical' };
    case 'calculated': {
      const items = generateDatasetItems(question);
      const variant = randomInt(random, 0, items.length - 1);
      return { type: 'calculated', variant, values: items[variant] ?? {} };
    }
    case 'ddwtos':
      return {
        type: 'ddwtos',
        choiceOrder: ddwtosOrder(question.choices.map((choice) => choice.group), allowShuffle && question.shuffleAnswers, random),
      };
    default:
      return {
        type: 'multianswer',
        partOrders: question.subquestions.map((part) =>
          part.kind === 'multichoice' ? maybeShuffled(part.answers.length, allowShuffle && part.shuffle, random) : null,
        ),
      };
  }
}
