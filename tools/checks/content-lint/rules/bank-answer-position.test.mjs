import { describe, expect, it } from 'vitest';
import { file } from '../__fixtures__/baseline.mjs';
import { checkBankAnswerPosition } from './bank-answer-position.mjs';

const bank = (questions) => file('content/banks/private.yaml', [
  'questions:',
  ...questions,
]);

const single = (id, correctPosition) => [
  `  - id: ${id}`,
  '    type: multichoice',
  '    single: true',
  '    answers:',
  ...[0, 1, 2, 3].map((position) => [
    `      - text: Варіант ${position + 1}`,
    `        fraction: ${position === correctPosition ? 100 : 0}`,
  ]).flat(),
];

const trueFalse = (id, correct) => [
  `  - id: ${id}`,
  '    type: truefalse',
  `    correct: ${correct}`,
];

describe('bank-answer-position', () => {
  it('warns about a dominant multichoice position and uniform truefalse answers', () => {
    const content = [
      ...single('q1', 0), ...single('q2', 0), ...single('q3', 0), ...single('q4', 1),
      ...trueFalse('q5', true), ...trueFalse('q6', true),
    ];

    const findings = checkBankAnswerPosition([bank(content)]);

    expect(findings).toHaveLength(2);
    expect(findings).toMatchObject([
      { level: 'warning', rule: 'bank-answer-position' },
      { level: 'warning', rule: 'bank-answer-position' },
    ]);
    expect(findings.map((finding) => finding.message).join('\n')).toContain('q1, q2, q3');
    expect(findings.map((finding) => finding.hint).join('\n')).toContain('рівномірно');
  });

  it('accepts balanced multichoice positions and mixed truefalse answers', () => {
    const content = [
      ...single('q1', 0), ...single('q2', 1), ...single('q3', 2), ...single('q4', 3),
      ...trueFalse('q5', true), ...trueFalse('q6', false),
    ];

    expect(checkBankAnswerPosition([bank(content)])).toEqual([]);
  });
});
