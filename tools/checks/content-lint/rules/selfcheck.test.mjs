import { describe, expect, it } from 'vitest';
import { file } from '../__fixtures__/baseline.mjs';
import { checkSelfcheckAnswerLength, checkSelfcheckAnswerPosition } from './selfcheck.mjs';

const lecture = (questions) => file('content/modules/m1/t02/lecture.mdx', [
  '<SelfCheck topic="t02" questions={[',
  ...questions,
  ']} />',
]);

const question = (stem, options) => [
  `  { stem: '${stem}', options: [`,
  ...options.map(({ text, correct = false }) => `    { text: '${text}', ${correct ? 'correct: true' : 'why: \'Ні.\''} },`),
  '  ] },',
];

describe('selfcheck answer position', () => {
  it('warns when one answer position dominates a topic and lists questions', () => {
    const content = [
      ...question('Питання 1', [{ text: 'Правильна', correct: true }, { text: 'Відволікач' }]),
      ...question('Питання 2', [{ text: 'Правильна', correct: true }, { text: 'Відволікач' }]),
      ...question('Питання 3', [{ text: 'Правильна', correct: true }, { text: 'Відволікач' }]),
      ...question('Питання 4', [{ text: 'Відволікач' }, { text: 'Правильна', correct: true }]),
    ];

    const findings = checkSelfcheckAnswerPosition([lecture(content)]);

    expect(findings).toMatchObject([{ level: 'warning', rule: 'selfcheck-answer-position' }]);
    expect(findings[0].message).toContain('1, 2, 3');
    expect(findings[0].hint).toContain('перемішайте');
  });

  it('accepts a balanced distribution of answer positions', () => {
    const content = [
      ...question('Питання 1', [{ text: 'Правильна', correct: true }, { text: 'Відволікач' }]),
      ...question('Питання 2', [{ text: 'Відволікач' }, { text: 'Правильна', correct: true }]),
      ...question('Питання 3', [{ text: 'Правильна', correct: true }, { text: 'Відволікач' }]),
      ...question('Питання 4', [{ text: 'Відволікач' }, { text: 'Правильна', correct: true }]),
    ];

    expect(checkSelfcheckAnswerPosition([lecture(content)])).toEqual([]);
  });
});

describe('selfcheck answer length', () => {
  it('warns about longest correct answers and short distractors with numbers', () => {
    const content = [
      ...question('Питання 1', [{ text: 'Дуже довга правильна відповідь', correct: true }, { text: 'Ні' }]),
      ...question('Питання 2', [{ text: 'Дуже довга правильна відповідь', correct: true }, { text: 'Достатній дистрактор' }]),
      ...question('Питання 3', [{ text: 'Дуже довга правильна відповідь', correct: true }, { text: 'Достатній дистрактор' }]),
      ...question('Питання 4', [{ text: 'Дуже довга правильна відповідь', correct: true }, { text: 'Достатній дистрактор' }]),
    ];

    const findings = checkSelfcheckAnswerLength([lecture(content)]);

    expect(findings).toHaveLength(2);
    expect(findings.some((finding) => finding.message.includes('найдовшою'))).toBe(true);
    expect(findings.some((finding) => finding.message.includes('симв.'))).toBe(true);
    expect(findings.every((finding) => finding.level === 'warning' && finding.hint.includes('скорочуйте'))).toBe(true);
  });

  it('accepts answers with balanced lengths', () => {
    const content = [
      ...question('Питання 1', [{ text: 'Відповідь', correct: true }, { text: 'Інший варіант' }]),
      ...question('Питання 2', [{ text: 'Відповідь', correct: true }, { text: 'Інший варіант' }]),
      ...question('Питання 3', [{ text: 'Відповідь', correct: true }, { text: 'Інший варіант' }]),
    ];

    expect(checkSelfcheckAnswerLength([lecture(content)])).toEqual([]);
  });
});
