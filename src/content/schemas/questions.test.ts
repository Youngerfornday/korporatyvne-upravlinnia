import { describe, expect, it } from 'vitest';
import {
  allQuestionExamples,
  calculated,
  ddwtos,
  matching,
  multianswer,
  multichoiceMulti,
  multichoiceSingle,
  numerical,
} from './__fixtures__/questions';
import { BankFileSchema, CONTROL_CANARY_PREFIX, QuestionSchema } from './questions';

function issuesOf(input: unknown): string[] {
  const result = QuestionSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('QuestionSchema: valid examples', () => {
  it.each(allQuestionExamples().map((question) => [question.type, question.id, question] as const))(
    'accepts %s example %s',
    (_type, _id, question) => {
      expect(issuesOf(question)).toEqual([]);
    },
  );

  it('fills Moodle defaults', () => {
    // Act
    const parsed = QuestionSchema.parse(calculated());

    // Assert
    expect(parsed.defaultMark).toBe(1);
    expect(parsed.lawRef).toEqual([]);
    if (parsed.type !== 'calculated') throw new Error('unexpected type');
    expect(parsed.answers[0]).toMatchObject({ tolerance: 0.01, toleranceType: 'relative', correctAnswerLength: 2 });
    expect(parsed.itemCount).toBe(10);
  });
});

describe('QuestionSchema: shared fields', () => {
  it('rejects an unknown Bloom level and an id that does not start with the topic', () => {
    expect(issuesOf({ ...multichoiceSingle(), bloom: 'create' }).length).toBeGreaterThan(0);
    expect(issuesOf({ ...multichoiceSingle(), id: 't05-q001' })).toContainEqual(expect.stringMatching(/t04-/));
  });

  it('rejects a law reference checked in the future', () => {
    const question = { ...multichoiceSingle(), lawRef: [{ act: 'Закон', article: 'ст. 1', checkedAt: '2999-01-01' }] };
    expect(issuesOf(question)).toContainEqual(expect.stringMatching(/майбутн/));
  });

  it('accepts a law reference date parsed by YAML as a Date object', () => {
    const question = { ...multichoiceSingle(), lawRef: [{ act: 'Закон', article: 'ст. 1', checkedAt: new Date('2026-09-01') }] };
    expect(issuesOf(question)).toEqual([]);
  });

  it('requires feedback on every option', () => {
    const question = multichoiceSingle();
    const withoutFeedback = { ...question, answers: question.answers.map(({ feedback: _f, ...rest }) => rest) };
    expect(issuesOf(withoutFeedback).length).toBeGreaterThan(0);
  });
});

describe('QuestionSchema: multichoice', () => {
  it('requires exactly one 100% answer in single mode', () => {
    const question = multichoiceSingle();
    const twoCorrect = { ...question, answers: question.answers.map((answer) => ({ ...answer, fraction: 100 })) };
    const noneCorrect = { ...question, answers: question.answers.map((answer) => ({ ...answer, fraction: 0 })) };
    expect(issuesOf(twoCorrect)).toContainEqual(expect.stringMatching(/рівно одна/));
    expect(issuesOf(noneCorrect)).toContainEqual(expect.stringMatching(/рівно одна/));
  });

  it('requires positive fractions to add up to 100% in multi mode', () => {
    const question = multichoiceMulti();
    const partial = { ...question, answers: question.answers.map((a) => (a.fraction === 50 ? { ...a, fraction: 40 } : a)) };
    expect(issuesOf(partial)).toContainEqual(expect.stringMatching(/100/));
  });

  it('accepts thirds that Moodle stores as 33.33333', () => {
    const question = multichoiceMulti();
    const thirds = {
      ...question,
      answers: [
        { text: 'А', fraction: 33.33333, feedback: 'так' },
        { text: 'Б', fraction: 33.33333, feedback: 'так' },
        { text: 'В', fraction: 33.33333, feedback: 'так' },
        { text: 'Г', fraction: -100, feedback: 'ні' },
      ],
    };
    expect(issuesOf(thirds)).toEqual([]);
  });

  it('rejects fractions that are not Moodle grade options', () => {
    const question = multichoiceSingle();
    const odd = { ...question, answers: question.answers.map((a, i) => (i === 1 ? { ...a, fraction: 37 } : a)) };
    expect(issuesOf(odd)).toContainEqual(expect.stringMatching(/Moodle/));
  });

  it('rejects duplicate option texts regardless of case and spacing', () => {
    const question = multichoiceSingle();
    const duplicate = { ...question, answers: [...question.answers, { text: ' наглядова  рада', fraction: 0, feedback: 'x' }] };
    expect(issuesOf(duplicate)).toContainEqual(expect.stringMatching(/повторю/));
  });
});

describe('QuestionSchema: matching, numerical, calculated', () => {
  it('requires at least three answers in total for matching', () => {
    expect(issuesOf({ ...matching(), distractors: [] })).toContainEqual(expect.stringMatching(/три/));
  });

  it('rejects a distractor that equals a correct answer', () => {
    expect(issuesOf({ ...matching(), distractors: ['Дворівнева рада'] })).toContainEqual(expect.stringMatching(/дистрактор/i));
  });

  it('requires a 100% answer and a non-negative tolerance for numerical', () => {
    const question = numerical();
    expect(issuesOf({ ...question, answers: [{ ...question.answers[0], fraction: 50 }] })).toContainEqual(
      expect.stringMatching(/100%/),
    );
    expect(issuesOf({ ...question, answers: [{ ...question.answers[0], tolerance: -1 }] }).length).toBeGreaterThan(0);
  });

  it('rejects a numeric value written with a decimal comma in YAML (a string)', () => {
    const question = numerical();
    expect(issuesOf({ ...question, answers: [{ ...question.answers[0], value: '32,5' }] }).length).toBeGreaterThan(0);
  });

  it('rejects calculated formulas with unknown wildcards, unused datasets or unsafe tokens', () => {
    const question = calculated();
    const unknownWildcard = { ...question, answers: [{ ...question.answers[0], formula: '{p} * {x}' }] };
    const unusedDataset = { ...question, datasets: [...question.datasets, { name: 'z', min: 1, max: 2, decimals: 0 }] };
    const unsafe = { ...question, answers: [{ ...question.answers[0], formula: 'system({p})' }] };
    expect(issuesOf(unknownWildcard)).toContainEqual(expect.stringMatching(/\{x\}/));
    expect(issuesOf(unusedDataset)).toContainEqual(expect.stringMatching(/\{z\}/));
    expect(issuesOf(unsafe)).toContainEqual(expect.stringMatching(/system/));
  });

  it('rejects a dataset whose minimum is above its maximum', () => {
    const question = calculated();
    const inverted = { ...question, datasets: question.datasets.map((d) => (d.name === 'p' ? { ...d, min: 10, max: 1 } : d)) };
    expect(issuesOf(inverted)).toContainEqual(expect.stringMatching(/min/));
  });

  it('allows Moodle functions such as pow and round in formulas', () => {
    const question = calculated();
    const withFunctions = { ...question, answers: [{ ...question.answers[0], formula: 'round(pow({p}, 1) * {r} / 100 / {n}, 2)' }] };
    expect(issuesOf(withFunctions)).toEqual([]);
  });
});

describe('QuestionSchema: ddwtos and multianswer', () => {
  it('requires gaps that point to existing choices', () => {
    expect(issuesOf({ ...ddwtos(), stem: 'Без пропусків.' })).toContainEqual(expect.stringMatching(/\[\[1\]\]/));
    expect(issuesOf({ ...ddwtos(), stem: 'Пропуск [[9]].' })).toContainEqual(expect.stringMatching(/\[\[9\]\]/));
  });

  it('rejects a finite choice used in two gaps', () => {
    expect(issuesOf({ ...ddwtos(), stem: 'Перший [[1]], другий [[1]].' })).toContainEqual(expect.stringMatching(/infinite/));
  });

  it('requires placeholders {#n} to match subquestions one to one', () => {
    expect(issuesOf({ ...multianswer(), stem: 'Лише {#1}.' })).toContainEqual(expect.stringMatching(/\{#2\}/));
    expect(issuesOf({ ...multianswer(), stem: '{#1} {#2} {#3}' })).toContainEqual(expect.stringMatching(/\{#3\}/));
  });

  it('requires a 100% answer in every Cloze subquestion', () => {
    const question = multianswer();
    const [first, second] = question.subquestions;
    const broken = { ...question, subquestions: [first, { ...second, answers: [{ ...second?.answers[0], fraction: 0 }] }] };
    expect(issuesOf(broken)).toContainEqual(expect.stringMatching(/100%/));
  });
});

describe('BankFileSchema', () => {
  const trainingBank = () => ({
    schemaVersion: 1,
    kind: 'training',
    module: 'm2',
    questions: [multichoiceSingle(), ddwtos()],
  });

  it('accepts a training bank without canary', () => {
    expect(BankFileSchema.safeParse(trainingBank()).success).toBe(true);
  });

  it('rejects a training bank that carries a canary', () => {
    const result = BankFileSchema.safeParse({ ...trainingBank(), canary: `${CONTROL_CANARY_PREFIX}m2` });
    expect(result.success).toBe(false);
  });

  it('requires a control bank canary with the agreed prefix', () => {
    const control = { ...trainingBank(), kind: 'control' };
    expect(BankFileSchema.safeParse(control).success).toBe(false);
    expect(BankFileSchema.safeParse({ ...control, canary: 'CANARY-m2' }).success).toBe(false);
    expect(BankFileSchema.safeParse({ ...control, canary: CONTROL_CANARY_PREFIX }).success).toBe(false);
    expect(BankFileSchema.safeParse({ ...control, canary: `${CONTROL_CANARY_PREFIX}m2-2026` }).success).toBe(true);
  });

  it('builds the canary prefix without spelling it out, so source files never trip the leak check', () => {
    expect(CONTROL_CANARY_PREFIX.split('-')).toEqual(['KU', 'CONTROL', 'CANARY', '']);
  });

  it('rejects duplicate question ids inside one bank', () => {
    const result = BankFileSchema.safeParse({ ...trainingBank(), questions: [multichoiceSingle(), multichoiceSingle()] });
    expect(result.success).toBe(false);
  });
});
