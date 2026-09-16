import { describe, expect, test } from 'vitest';
import { QuestionSchema } from '../../content/schemas/questions';
import { allQuestionExamples } from '../../content/schemas/__fixtures__/questions';
import { marksOfText, marksText, questionTypeLabel, questionsText } from './quiz-texts';

describe('questionTypeLabel', () => {
  test('кожен тип фікстур має український підпис; множинний вибір відрізняється від одиночного', () => {
    const labels = allQuestionExamples().map((raw) => questionTypeLabel(QuestionSchema.parse(raw)));
    expect(labels).toEqual([
      'одиночний вибір',
      'множинний вибір',
      'правда чи неправда',
      'відповідність',
      'числова відповідь',
      'розрахунок',
      'заповнення пропусків',
      'кейс із пропусками',
    ]);
  });
});

describe('бали', () => {
  test('відмінювання балів', () => {
    expect(marksText(1)).toBe('1 бал');
    expect(marksText(2)).toBe('2 бали');
    expect(marksText(0.5)).toBe('0,5 бала');
  });

  test('«з N балів» у родовому відмінку', () => {
    expect(marksOfText(0.5, 1)).toBe('0,5 з 1 бала');
    expect(marksOfText(3, 5)).toBe('3 з 5 балів');
  });

  test('кількість питань', () => {
    expect(questionsText(1)).toBe('1 питання');
    expect(questionsText(15)).toBe('15 питань');
  });
});
