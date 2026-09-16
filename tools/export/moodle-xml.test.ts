import { describe, expect, it } from 'vitest';
import { CONTROL_CANARY_PREFIX } from '../../src/content/schemas/questions.ts';
import { REGISTRY } from './__fixtures__/registry.ts';
import {
  bankToMoodleXml,
  banksToMoodleXml,
  describeQuestionPlan,
  findBankProblems,
  planQuestionExport,
} from './moodle-xml.ts';
import { ExportError } from './registry.ts';
import { allExampleBanks, bank, examples, singleQuestionXml } from './test-support/banks.ts';
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
      ['m1', 'top/Модуль 1. Основи корпоративного управління'],
      ['t01', 'top/Модуль 1. Основи корпоративного управління/Тема 01. Корпорація'],
      ['t02', 'top/Модуль 1. Основи корпоративного управління/Тема 02. Моделі КУ'],
      ['m2', 'top/Модуль 2. Органи корпоративного управління'],
      ['t04', 'top/Модуль 2. Органи корпоративного управління/Тема 04. Акціонери та загальні збори'],
      ['t05', 'top/Модуль 2. Органи корпоративного управління/Тема 05. Наглядова рада'],
      ['m3', 'top/Модуль 3. Капітал // ринок'],
      ['t07', 'top/Модуль 3. Капітал // ринок/Тема 07. Капітал і дивіденди'],
    ]);
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
    const control = bank('m2', [examples.multichoiceSingle()], { kind: 'control', canary });
    const xml = bankToMoodleXml(control, REGISTRY);
    expect(xml).not.toContain(canary);
    expect(xml).not.toContain(CONTROL_CANARY_PREFIX);
    expect(xml).toContain('контрольний банк питань');
    expect(JSON.stringify(describeQuestionPlan(planQuestionExport([control], REGISTRY)))).not.toContain(CONTROL_CANARY_PREFIX);
  });

  it('експорт падає, якщо canary випадково опинився в тексті питання', () => {
    const leaked = { ...examples.multichoiceSingle(), stem: `Питання ${canary}?` };
    const control = bank('m2', [leaked], { kind: 'control', canary });
    expect(() => bankToMoodleXml(control, REGISTRY)).toThrow(/Canary контрольного банку/);
  });
});

describe('помилки вхідних даних', () => {
  it('збирає всі проблеми українською', () => {
    const m1 = bank('m1', [examples.trueFalse()]);
    const wrongModule = bank('m1', [examples.multichoiceSingle()]);
    const unknownTopic = bank('m2', [{ ...examples.ddwtos(), id: 't09-q007', topic: 't09' }]);
    const control = bank('m3', [examples.numerical()], { kind: 'control', canary: `${CONTROL_CANARY_PREFIX}m3` });
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
    expect(manifest.categories.slice(0, 2)).toEqual([
      { idnumber: 'm1', path: 'top/Модуль 1. Основи корпоративного управління', parent: null },
      { idnumber: 't01', path: 'top/Модуль 1. Основи корпоративного управління/Тема 01. Корпорація', parent: 'm1' },
    ]);
    const cloze = manifest.questions.find((entry) => entry.idnumber === 't04-q008');
    expect(cloze).toEqual({ idnumber: 't04-q008', qtype: 'multianswer', category: 't04', defaultMark: 2, tags: ['bloom-analyze', 'topic-t04'] });
  });
});
