import { describe, expect, it } from 'vitest';
import { CONTROL_CANARY_PREFIX } from '../../src/content/schemas/questions.ts';
import { NBSP } from '../../src/lib/typography/normalize.ts';
import { REGISTRY } from './__fixtures__/registry.ts';
import {
  bankToMoodleXml,
  banksToMoodleXml,
  describeQuestionPlan,
  findBankProblems,
  planQuestionExport,
} from './moodle-xml.ts';
import { ExportError } from './registry.ts';
import { allExampleBanks, bank, controlBank, examples, parsedQuestion, singleQuestionXml } from './test-support/banks.ts';
import { child, childrenNamed, parseXml, textAt } from './test-support/xml-tree.ts';

const EXAMPLES = {
  'multichoice (один правильний)': examples.multichoiceSingle(),
  'multichoice (множинний вибір)': examples.multichoiceMulti(),
  truefalse: examples.trueFalse(),
  matching: examples.matching(),
  numerical: examples.numerical(),
  calculated: examples.calculated(),
  ddwtos: examples.ddwtos(),
  'multianswer (Cloze)': examples.multianswer(),
};

describe('bankToMoodleXml: снапшоти кожного типу', () => {
  for (const [label, raw] of Object.entries(EXAMPLES)) {
    it(`${label}: стабільний і well-formed XML`, () => {
      const xml = singleQuestionXml(raw);
      expect(() => parseXml(xml)).not.toThrow();
      expect(singleQuestionXml(raw)).toBe(xml);
      expect(xml).toMatchSnapshot();
    });
  }
});

describe('категорії, теги й порядок', () => {
  it('виводить top/Модуль N. Назва/Тема NN. Назва з idnumber модуля й теми, модуль перед темами', () => {
    const quiz = parseXml(banksToMoodleXml(allExampleBanks(), REGISTRY));
    const categories = childrenNamed(quiz, 'question')
      .filter((node) => node.attributes.type === 'category')
      .map((node) => [textAt(node, 'idnumber'), textAt(node, 'category', 'text')]);
    expect(categories).toEqual([
      ['tr', 'top/Тренувальний банк'],
      ['tr-m1', 'top/Тренувальний банк/Модуль 1. Основи корпоративного управління'],
      ['tr-t01', 'top/Тренувальний банк/Модуль 1. Основи корпоративного управління/Тема 01. Корпорація'],
      ['tr-t02', 'top/Тренувальний банк/Модуль 1. Основи корпоративного управління/Тема 02. Моделі КУ'],
      ['tr-m2', 'top/Тренувальний банк/Модуль 2. Органи корпоративного управління'],
      ['tr-t04', 'top/Тренувальний банк/Модуль 2. Органи корпоративного управління/Тема 04. Акціонери та загальні збори'],
      ['tr-t05', 'top/Тренувальний банк/Модуль 2. Органи корпоративного управління/Тема 05. Наглядова рада'],
      ['tr-m3', 'top/Тренувальний банк/Модуль 3. Капітал // ринок'],
      ['tr-t07', 'top/Тренувальний банк/Модуль 3. Капітал // ринок/Тема 07. Капітал і дивіденди'],
    ]);
  });

  it('контрольний банк лежить в окремій гілці з власними idnumber', () => {
    const control = controlBank('m2', [examples.multichoiceSingle(), examples.ddwtos()]);
    const categories = childrenNamed(parseXml(bankToMoodleXml(control, REGISTRY)), 'question')
      .filter((node) => node.attributes.type === 'category')
      .map((node) => [textAt(node, 'idnumber'), textAt(node, 'category', 'text')]);
    expect(categories).toEqual([
      ['ct', 'top/Контрольний банк'],
      ['ct-m2', 'top/Контрольний банк/Модуль 2. Органи корпоративного управління'],
      ['ct-t04', 'top/Контрольний банк/Модуль 2. Органи корпоративного управління/Тема 04. Акціонери та загальні збори'],
    ]);
    const ids = childrenNamed(parseXml(bankToMoodleXml(control, REGISTRY)), 'question')
      .filter((node) => node.attributes.type !== 'category')
      .map((node) => textAt(node, 'idnumber'));
    expect(ids).toEqual(['t04-k001', 't04-k007']);
  });

  it('порядок не залежить від порядку банків: реєстр, а в межах теми — порядок банку', () => {
    const banks = allExampleBanks();
    const forward = banksToMoodleXml(banks, REGISTRY);
    expect(banksToMoodleXml([...banks].reverse(), REGISTRY)).toBe(forward);
    const ids = childrenNamed(parseXml(forward), 'question')
      .filter((node) => node.attributes.type !== 'category')
      .map((node) => textAt(node, 'idnumber'));
    expect(ids).toEqual(['t01-q003', 't02-q004', 't04-q001', 't04-q007', 't04-q008', 't05-q002', 't07-q005', 't07-q006']);
  });

  it('норми з lawRef дописуються до загального відгуку окремими рядками', () => {
    const raw = {
      ...examples.multichoiceSingle(),
      lawRef: [
        { act: 'Закону № 2465-IX', article: 'ст. 40 ч. 1', checkedAt: '2026-09-15' },
        { act: 'Кодексу корпоративного управління', article: 'п. 2.3', checkedAt: '2026-09-01', url: 'https://zakon.rada.gov.ua/laws/show/2465-20' },
      ],
    };
    const feedback = textAt(parsedQuestion(raw), 'generalfeedback', 'text');
    expect(feedback).toContain(`<p>Норма: ст.${NBSP}40 ч.${NBSP}1 Закону №${NBSP}2465-IX (перевірено 15.09.2026)</p>`);
    expect(feedback).toContain(
      `<p>Норма: <a href="https://zakon.rada.gov.ua/laws/show/2465-20">п.${NBSP}2.3 Кодексу корпоративного управління</a> (перевірено 01.09.2026)</p>`,
    );
    expect(textAt(parsedQuestion(examples.trueFalse()), 'generalfeedback', 'text')).not.toContain('Норма:');
  });

  it('кожне питання має теги bloom-<рівень> і topic-tNN та idnumber = ID', () => {
    const quiz = parseXml(bankToMoodleXml(bank('m2', [examples.multianswer()]), REGISTRY));
    const node = childrenNamed(quiz, 'question').find((entry) => entry.attributes.type === 'cloze');
    expect(node).toBeDefined();
    const tags = childrenNamed(child(node!, 'tags'), 'tag').map((tag) => textAt(tag, 'text'));
    expect(tags).toEqual(['bloom-analyze', 'topic-t04']);
    expect(textAt(node!, 'idnumber')).toBe('t04-q008');
  });
});

describe('текст: типографіка, HTML, CDATA', () => {
  it('нормалізує лапки й апостроф, екранує HTML, ділить абзаци і зберігає ]]> усередині CDATA', () => {
    const raw = {
      ...examples.trueFalse(),
      stem: 'Об\'єкт "контролю" <b>A & B</b> ]]> кінець.\nДругий рядок\n\nНовий абзац',
    };
    const question = childrenNamed(parseXml(singleQuestionXml(raw)), 'question').find((q) => q.attributes.type === 'truefalse');
    expect(textAt(question!, 'questiontext', 'text')).toBe(
      '<p>Об’єкт «контролю» &lt;b&gt;A &amp; B&lt;/b&gt; ]]&gt; кінець.<br>Другий рядок</p><p>Новий абзац</p>',
    );
    expect(textAt(question!, 'name', 'text')).toBe('Об’єкт «контролю» &lt;b&gt;A & B&lt;/b&gt; ]]&gt; кінець. Другий рядок Новий…');
  });
});

describe('canary контрольних банків', () => {
  const canary = `${CONTROL_CANARY_PREFIX}m2-test`;

  it('не потрапляє у вивід', () => {
    const control = controlBank('m2', [examples.multichoiceSingle()], 'm2-test');
    const xml = bankToMoodleXml(control, REGISTRY);
    expect(xml).not.toContain(canary);
    expect(xml).not.toContain(CONTROL_CANARY_PREFIX);
    expect(xml).toContain('контрольний банк питань');
    expect(JSON.stringify(describeQuestionPlan(planQuestionExport([control], REGISTRY)))).not.toContain(CONTROL_CANARY_PREFIX);
  });

  it('експорт падає, якщо canary випадково опинився в тексті питання', () => {
    const leaked = { ...examples.multichoiceSingle(), stem: `Питання ${canary}?` };
    expect(() => bankToMoodleXml(controlBank('m2', [leaked], 'm2-test'), REGISTRY)).toThrow(/Canary контрольного банку/);
  });
});

describe('помилки вхідних даних', () => {
  it('збирає всі проблеми українською', () => {
    const m1 = bank('m1', [examples.trueFalse()]);
    const wrongModule = bank('m1', [examples.multichoiceSingle()]);
    const unknownTopic = bank('m2', [{ ...examples.ddwtos(), id: 't09-q007', topic: 't09' }]);
    const control = controlBank('m3', [examples.numerical()], 'm3');
    const unregistered = bank('m7', [{ ...examples.trueFalse(), id: 't01-q999' }]);
    expect(findBankProblems([m1, wrongModule, unknownTopic, control, unregistered, m1], REGISTRY)).toEqual([
      'Тренувальні й контрольні банки не можна змішувати в одному файлі',
      'Модуль m1 має більше одного банку',
      'Модуль банку «m7» не зареєстровано в course.yaml',
      'Питання «t04-q001» належить модулю m2, а банк — модулю m1',
      'Питання «t09-q007»: тему «t09» не зареєстровано в course.yaml',
      'Питання «t01-q999» належить модулю m1, а банк — модулю m7',
      'Дублікат ID питання «t01-q003» у банках',
    ]);
    expect(findBankProblems([], REGISTRY)).toEqual(['Немає жодного банку питань для експорту']);
  });

  it('planQuestionExport кидає ExportError зі списком проблем', () => {
    const error = (() => {
      try {
        planQuestionExport([bank('m1', [examples.multichoiceSingle()])], REGISTRY);
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(ExportError);
    expect((error as ExportError).problems).toHaveLength(1);
    expect((error as ExportError).message).toContain('Експорт неможливий');
  });
});

describe('describeQuestionPlan', () => {
  it('описує очікуваний стан банку Moodle: типи бази, категорії з батьками, бали', () => {
    const manifest = describeQuestionPlan(planQuestionExport(allExampleBanks(), REGISTRY));
    expect(manifest.total).toBe(8);
    expect(manifest.byType).toEqual({ calculated: 1, ddwtos: 1, match: 1, multianswer: 1, multichoice: 2, numerical: 1, truefalse: 1 });
    expect(Object.keys(manifest.byType)).toEqual([...Object.keys(manifest.byType)].sort());
    expect(manifest.categories.slice(0, 3)).toEqual([
      { idnumber: 'tr', path: 'top/Тренувальний банк', parent: null },
      { idnumber: 'tr-m1', path: 'top/Тренувальний банк/Модуль 1. Основи корпоративного управління', parent: 'tr' },
      { idnumber: 'tr-t01', path: 'top/Тренувальний банк/Модуль 1. Основи корпоративного управління/Тема 01. Корпорація', parent: 'tr-m1' },
    ]);
    const cloze = manifest.questions.find((entry) => entry.idnumber === 't04-q008');
    expect(cloze).toEqual({ idnumber: 't04-q008', qtype: 'multianswer', category: 'tr-t04', defaultMark: 2, tags: ['bloom-analyze', 'topic-t04'] });
  });
});
