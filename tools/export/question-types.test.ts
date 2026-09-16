import { describe, expect, it } from 'vitest';
import { MOODLE_GRADE_PERCENTS } from '../../src/content/schemas/questions.ts';
import { NBSP } from '../../src/lib/typography/normalize.ts';
import { examples, parsedQuestion } from './test-support/banks.ts';
import { child, childrenNamed, textAt, type XmlNode } from './test-support/xml-tree.ts';

const FRACTION_PRECISION = 1e-5;

function fractions(node: XmlNode): number[] {
  return childrenNamed(node, 'answer').map((answer) => Number(answer.attributes.fraction));
}

/** Частка має збігатися з варіантом Moodle так, як перевіряє match_grade_options (±0,00001 частки). */
function isMoodleGrade(percent: number): boolean {
  return MOODLE_GRADE_PERCENTS.some((grade) => Math.abs(Math.abs(percent) / 100 - grade / 100) < FRACTION_PRECISION);
}

describe('multichoice', () => {
  it('один правильний: single, перемішування, нумерація, без стандартної інструкції й shownumcorrect', () => {
    const node = parsedQuestion(examples.multichoiceSingle());
    expect(textAt(node, 'single')).toBe('true');
    expect(textAt(node, 'shuffleanswers')).toBe('true');
    expect(textAt(node, 'answernumbering')).toBe('abc');
    expect(textAt(node, 'showstandardinstruction')).toBe('0');
    expect(childrenNamed(node, 'shownumcorrect')).toHaveLength(0);
    expect(fractions(node)).toEqual([100, 0, 0]);
    expect(childrenNamed(node, 'answer').map((answer) => textAt(answer, 'text'))).toEqual([
      'Загальні збори акціонерів',
      'Наглядова рада',
      'Виконавчий орган',
    ]);
    expect(textAt(childrenNamed(node, 'answer')[1] as XmlNode, 'feedback', 'text')).toBe(
      '<p>Наглядова рада контролює виконавчий орган.</p>',
    );
  });

  it('множинний вибір: частковий бал і штраф як канонічні значення Moodle, інструкція й shownumcorrect', () => {
    const raw = {
      ...examples.multichoiceMulti(),
      shuffleAnswers: false,
      answerNumbering: 'none',
      answers: [
        { text: 'A', fraction: 33.333, feedback: 'Так.' },
        { text: 'B', fraction: 33.33333, feedback: 'Так.' },
        { text: 'C', fraction: 33.3334, feedback: 'Так.' },
        { text: 'D', fraction: -66.66667, feedback: 'Ні.' },
      ],
    };
    const node = parsedQuestion(raw);
    expect(textAt(node, 'single')).toBe('false');
    expect(textAt(node, 'shuffleanswers')).toBe('false');
    expect(textAt(node, 'answernumbering')).toBe('none');
    expect(textAt(node, 'showstandardinstruction')).toBe('1');
    expect(childrenNamed(node, 'shownumcorrect')).toHaveLength(1);
    const attributes = childrenNamed(node, 'answer').map((answer) => answer.attributes.fraction);
    expect(attributes).toEqual(['33.33333', '33.33333', '33.33333', '-66.66667']);
    expect(fractions(node).every(isMoodleGrade)).toBe(true);
  });

  it('усі оцінки Moodle зі знаком проходять округлий шлях без зміни', () => {
    const grades = MOODLE_GRADE_PERCENTS.filter((grade) => grade > 0 && grade < 100);
    const answers = grades.flatMap((grade, index) => [
      { text: `Варіант ${index}`, fraction: grade, feedback: 'Ок.' },
      { text: `Штраф ${index}`, fraction: -grade, feedback: 'Ні.' },
    ]);
    const raw = { ...examples.multichoiceSingle(), answers: [{ text: 'Правильно', fraction: 100, feedback: 'Так.' }, ...answers] };
    const got = fractions(parsedQuestion(raw));
    const expected = [100, ...grades.flatMap((grade) => [grade, -grade])];
    got.forEach((value, index) => expect(Math.abs(value - (expected[index] as number))).toBeLessThan(FRACTION_PRECISION));
  });
});

describe('truefalse', () => {
  it.each([true, false])('правильна відповідь %s отримує 100, відгуки прив’язані до true/false', (correct) => {
    const node = parsedQuestion({ ...examples.trueFalse(), correct });
    const [trueAnswer, falseAnswer] = childrenNamed(node, 'answer') as [XmlNode, XmlNode];
    expect(textAt(trueAnswer, 'text')).toBe('true');
    expect(textAt(falseAnswer, 'text')).toBe('false');
    expect(trueAnswer.attributes.fraction).toBe(correct ? '100' : '0');
    expect(falseAnswer.attributes.fraction).toBe(correct ? '0' : '100');
    expect(textAt(trueAnswer, 'feedback', 'text')).toContain('саме відокремлення');
    expect(textAt(node, 'penalty')).toBe('1');
  });
});

describe('matching', () => {
  it('пари й дистрактори як subquestion, пояснення пар — у загальному відгуку', () => {
    const node = parsedQuestion(examples.matching());
    const subquestions = childrenNamed(node, 'subquestion');
    expect(subquestions.map((sub) => [textAt(sub, 'text'), textAt(sub, 'answer', 'text')])).toEqual([
      ['Англо-американська', 'Розпорошена власність'],
      ['Німецька', 'Дворівнева рада'],
      ['', 'Відсутність ради'],
    ]);
    expect(textAt(node, 'generalfeedback', 'text')).toBe(
      `<p>Моделі різняться структурою власності й${NBSP}роллю банків.</p><ul><li>Англо-американська → Розпорошена власність${NBSP}— Акції розподілені між багатьма інвесторами.</li><li>Німецька → Дворівнева рада${NBSP}— Наглядова рада відокремлена від правління.</li></ul>`,
    );
  });

  it('без відгуків до пар загальний відгук лишається як є', () => {
    const raw = { ...examples.matching(), pairs: examples.matching().pairs.map(({ prompt, answer }) => ({ prompt, answer })) };
    expect(textAt(parsedQuestion(raw), 'generalfeedback', 'text')).toBe(`<p>Моделі різняться структурою власності й${NBSP}роллю банків.</p>`);
  });
});

describe('numerical', () => {
  it('значення й допуск — числа з крапкою, що повертаються без втрат; без одиниць', () => {
    const raw = {
      ...examples.numerical(),
      answers: [
        { value: 32.5, tolerance: 0.01, fraction: 100, feedback: 'Так.' },
        { value: -0.0000001, tolerance: 1e-9, fraction: 50, feedback: 'Майже.' },
        { value: 1e21, tolerance: 0, fraction: 0, feedback: 'Ні.' },
      ],
    };
    const node = parsedQuestion(raw);
    const answers = childrenNamed(node, 'answer');
    expect(answers.map((answer) => textAt(answer, 'text'))).toEqual(['32.5', '-0.0000001', '1000000000000000000000']);
    expect(answers.map((answer) => textAt(answer, 'tolerance'))).toEqual(['0.01', '0.000000001', '0']);
    answers.forEach((answer, index) => {
      expect(Number(textAt(answer, 'text'))).toBe(raw.answers[index]?.value);
      expect(Number(textAt(answer, 'tolerance'))).toBe(raw.answers[index]?.tolerance);
      expect(textAt(answer, 'text')).not.toMatch(/,|e/i);
    });
    expect(textAt(node, 'showunits')).toBe('3');
  });
});

describe('calculated', () => {
  const raw = {
    ...examples.calculated(),
    itemCount: 7,
    answers: [
      { formula: '{p} * {r} / 100 / {n}', fraction: 100, feedback: 'Так.' },
      {
        formula: '{p} * {r} / {n}',
        fraction: 50,
        tolerance: 0.5,
        toleranceType: 'nominal',
        correctAnswerFormat: 'significant-figures',
        correctAnswerLength: 3,
        feedback: 'Частково.',
      },
      { formula: '{p}', fraction: 0, toleranceType: 'geometric', feedback: 'Ні.' },
    ],
    datasets: [
      { name: 'p', min: 500, max: 900, decimals: 0 },
      { name: 'r', min: 0.5, max: 60, decimals: 2, distribution: 'loguniform' },
      { name: 'n', min: -5, max: 5, decimals: 1 },
    ],
  };

  it('допуск, тип допуску, формат відповіді з числовими кодами Moodle', () => {
    const answers = childrenNamed(parsedQuestion(raw), 'answer');
    expect(answers.map((answer) => textAt(answer, 'text'))).toEqual(['{p} * {r} / 100 / {n}', '{p} * {r} / {n}', '{p}']);
    expect(answers.map((answer) => textAt(answer, 'tolerance'))).toEqual(['0.01', '0.5', '0.01']);
    expect(answers.map((answer) => textAt(answer, 'tolerancetype'))).toEqual(['1', '2', '3']);
    expect(answers.map((answer) => textAt(answer, 'correctanswerformat'))).toEqual(['1', '2', '1']);
    expect(answers.map((answer) => textAt(answer, 'correctanswerlength'))).toEqual(['2', '3', '2']);
    expect(answers.map((answer) => answer.attributes.fraction)).toEqual(['100', '50', '0']);
  });

  it('набори даних: усі поля, itemCount значень у межах min..max з потрібною кількістю знаків', () => {
    const definitions = childrenNamed(child(parsedQuestion(raw), 'dataset_definitions'), 'dataset_definition');
    expect(definitions).toHaveLength(3);
    raw.datasets.forEach((dataset, index) => {
      const definition = definitions[index] as XmlNode;
      expect(textAt(definition, 'status', 'text')).toBe('private');
      expect(textAt(definition, 'name', 'text')).toBe(dataset.name);
      expect(textAt(definition, 'type')).toBe('calculated');
      expect(textAt(definition, 'distribution', 'text')).toBe(dataset.distribution ?? 'uniform');
      expect(Number(textAt(definition, 'minimum', 'text'))).toBe(dataset.min);
      expect(Number(textAt(definition, 'maximum', 'text'))).toBe(dataset.max);
      expect(textAt(definition, 'decimals', 'text')).toBe(String(dataset.decimals));
      expect(textAt(definition, 'itemcount')).toBe('7');
      expect(textAt(definition, 'number_of_items')).toBe('7');
      const items = childrenNamed(child(definition, 'dataset_items'), 'dataset_item');
      expect(items.map((item) => textAt(item, 'number'))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      for (const item of items) {
        const value = textAt(item, 'value');
        expect(value).toMatch(dataset.decimals === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+\\.\\d{${dataset.decimals}}$`));
        expect(Number(value)).toBeGreaterThanOrEqual(dataset.min);
        expect(Number(value)).toBeLessThanOrEqual(dataset.max);
      }
    });
  });

});

describe('ddwtos', () => {
  it('пропуски [[n]] у стовбурі, dragbox з групою і infinite, пояснення варіантів у загальному відгуку', () => {
    const raw = {
      ...examples.ddwtos(),
      choices: [
        { text: 'понад 50%', feedback: 'Поріг кворуму.' },
        { text: 'простою більшістю', group: 2, infinite: true, feedback: 'Більшість.' },
        { text: 'A & <B>', feedback: 'Спецсимволи.' },
      ],
    };
    const node = parsedQuestion(raw);
    expect(textAt(node, 'questiontext', 'text')).toContain(`це [[1]] голосуючих акцій, а${NBSP}рішення ухвалюють [[2]] голосів`);
    const boxes = childrenNamed(node, 'dragbox');
    expect(boxes.map((box) => [textAt(box, 'text'), textAt(box, 'group'), childrenNamed(box, 'infinite').length])).toEqual([
      ['понад 50%', '1', 0],
      ['простою більшістю', '2', 1],
      ['A &amp; &lt;B&gt;', '1', 0],
    ]);
    expect(textAt(node, 'shuffleanswers')).toBe('1');
    expect(textAt(node, 'generalfeedback', 'text')).toContain(`<li>A &amp; &lt;B&gt;${NBSP}— Спецсимволи.</li>`);
  });
});
