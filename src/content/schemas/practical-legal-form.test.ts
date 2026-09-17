import { describe, expect, it } from 'vitest';
import { PracticalFileSchema } from './practical';
import { LegalFormChoiceSchema, legalFormIssues, legalFormSourceIssues } from './practical-legal-form';

const norm = (id: string, code = 'TOV-04') => ({
  id,
  code,
  article: `ст. 7 (${code})`,
  law: 'Закон № 2275-VIII',
  url: 'https://zakon.rada.gov.ua/laws/show/2275-19',
  checkedAt: '2026-09-14',
  summary: 'Письмова форма корпоративного договору.',
});

const CRITERIA = ['founders', 'investor', 'exit', 'disclosure'] as const;

const criterion = (id: string) => ({
  id,
  title: `Критерій ${id}`,
  question: `Питання про ${id}?`,
  options: [
    { id: 'one', label: 'Перший варіант' },
    { id: 'two', label: 'Другий варіант' },
  ],
});

const trainer = () => ({
  kind: 'legal-form-choice',
  norms: [norm('tov-dohovir'), norm('at-dohovir', 'AT-14')],
  forms: [
    { id: 'tov', title: 'Товариство з обмеженою відповідальністю', short: 'ТОВ', summary: 'Частки.', norms: ['tov-dohovir'], registryKey: 'tov' },
    { id: 'prat', title: 'Приватне акціонерне товариство', short: 'ПрАТ', summary: 'Акції.', norms: ['at-dohovir'] },
    { id: 'pat', title: 'Публічне акціонерне товариство', short: 'ПАТ', summary: 'Публічна пропозиція.', norms: ['at-dohovir'] },
  ],
  criteria: CRITERIA.map(criterion),
  rules: CRITERIA.flatMap((id) => [
    { form: 'tov', criterion: id, option: 'one', effect: 'fits', reason: 'Підходить.', norm: 'tov-dohovir' },
    { form: 'prat', criterion: id, option: 'two', effect: 'blocks', reason: 'Не підходить.', norm: 'at-dohovir' },
  ]),
  cases: [1, 2, 3].map((number) => ({
    id: `startup-${number}`,
    title: `Стартап ${number}`,
    description: 'Опис стартапу.',
    preset: Object.fromEntries(CRITERIA.map((id) => [id, 'one'])),
    answer: 'tov',
    explanation: 'Чому саме ця форма.',
    norm: 'tov-dohovir',
  })),
  statistics: {
    title: 'Кількість юридичних осіб за формами',
    note: 'Поділ на ПАТ і ПрАТ між поколіннями таблиць непорівнянний.',
    forms: [
      { key: 'at', title: 'Акціонерні товариства', short: 'АТ' },
      { key: 'tov', title: 'Товариства з обмеженою відповідальністю', short: 'ТОВ' },
    ],
    points: [
      { date: '2020-01-01', generation: 'pre-2022', source: 'edrpou', values: { at: 13_902, tov: 674_437 } },
      { date: '2022-01-01', generation: 'since-2022', source: 'edrpou', values: { at: 13_646, tov: 743_682 } },
      { date: '2026-01-01', generation: 'since-2022', source: 'edrpou', values: { at: 13_451, tov: 836_712 } },
    ],
  },
  agreement: {
    intro: 'Межі закону для корпоративного договору.',
    limits: [
      { id: 'written', title: 'Письмова форма', text: 'Інакше договір нікчемний.', norm: 'tov-dohovir' },
      { id: 'no-orders', title: 'Не за вказівками органів', text: 'Така умова нікчемна.', norm: 'tov-dohovir' },
    ],
    risks: [1, 2, 3, 4, 5].map((number) => ({
      id: `risk-${number}`,
      risk: `Ризик ${number}.`,
      mustSettle: 'Що має врегулювати умова.',
      consequence: 'Що буде без умови.',
      norm: 'tov-dohovir',
    })),
  },
  essay: { prompt: 'Чому ТОВ витіснили АТ?', maxWords: 300, expectations: ['Теза', 'Два аргументи'] },
});

const file = () => ({
  id: 'p02',
  title: 'Вибір форми бізнесу і корпоративний договір стартапу',
  intro: 'Оберіть форму та умови договору.',
  updatedAt: '2026-09-17',
  sources: [
    {
      id: 'edrpou',
      type: 'dataset',
      title: 'Кількість юридичних осіб за організаційно-правовими формами (ЄДРПОУ)',
      url: 'https://ukrstat.gov.ua/edrpoy/ukr/EDRPU_2020/ks_opfg/ks_opfg_0120.htm',
      checkedAt: '2026-09-15',
    },
  ],
  trainer: trainer(),
});

const issues = (data: unknown) => {
  const result = PracticalFileSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

const parsed = () => LegalFormChoiceSchema.parse(trainer());

describe('LegalFormChoiceSchema', () => {
  it('accepts a complete legal-form trainer inside the practical file', () => {
    const data = PracticalFileSchema.parse(file());
    expect(data.trainer.kind).toBe('legal-form-choice');
    expect(legalFormIssues(parsed())).toEqual([]);
  });

  it('requires the baseline code inside the article, as in lawRef', () => {
    const broken = { ...trainer(), norms: [{ ...norm('tov-dohovir'), article: 'ст. 7' }] };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/стаття має містити код «\(TOV-04\)»/));
  });

  it('rejects a code that is not shaped like a baseline row id', () => {
    const broken = { ...trainer(), norms: [{ ...norm('tov-dohovir'), code: 'tov4', article: 'ст. 7 (tov4)' }] };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/Код норми/));
  });

  it('reports a rule that names an unknown form, criterion or option', () => {
    const data = trainer();
    const broken = {
      ...data,
      rules: [
        ...data.rules,
        { form: 'fop', criterion: 'founders', option: 'one', effect: 'fits' as const, reason: 'Ні.', norm: 'tov-dohovir' },
        { form: 'tov', criterion: 'ghost', option: 'one', effect: 'fits' as const, reason: 'Ні.', norm: 'tov-dohovir' },
        { form: 'tov', criterion: 'founders', option: 'three', effect: 'fits' as const, reason: 'Ні.', norm: 'tov-dohovir' },
      ],
    };
    const messages = legalFormIssues(LegalFormChoiceSchema.parse(broken)).map((issue) => issue.message);
    expect(messages).toContainEqual(expect.stringMatching(/невідома форма «fop»/));
    expect(messages).toContainEqual(expect.stringMatching(/невідомий критерій «ghost»/));
    expect(messages).toContainEqual(expect.stringMatching(/немає варіанта «three»/));
  });

  it('reports the same rule written twice', () => {
    const data = trainer();
    const broken = { ...data, rules: [...data.rules, data.rules[0]!] };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/описано двічі/));
  });

  it('requires every norm reference to resolve', () => {
    const data = trainer();
    const broken = { ...data, rules: data.rules.map((rule) => ({ ...rule, norm: 'ghost-norm' })) };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/норму «ghost-norm» не описано/));
  });

  it('requires a startup preset to cover every criterion with a known option', () => {
    const data = trainer();
    const short = { ...data, cases: data.cases.map((item) => ({ ...item, preset: { founders: 'one' } })) };
    expect(issues({ ...file(), trainer: short })).toContainEqual(expect.stringMatching(/немає критерію «investor»/));
    const wrong = { ...data, cases: data.cases.map((item) => ({ ...item, preset: { ...item.preset, founders: 'four' } })) };
    expect(issues({ ...file(), trainer: wrong })).toContainEqual(expect.stringMatching(/немає варіанта «four»/));
    const unknownForm = { ...data, cases: data.cases.map((item) => ({ ...item, answer: 'fop' })) };
    expect(issues({ ...file(), trainer: unknownForm })).toContainEqual(expect.stringMatching(/невідома форма «fop»/));
  });

  it('requires every registry point to carry a number for every form of the series', () => {
    const data = trainer();
    const broken = {
      ...data,
      statistics: { ...data.statistics, points: data.statistics.points.map((point) => ({ ...point, values: { tov: point.values.tov } })) },
    };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/немає числа для форми «at»/));
  });

  it('rejects a duplicate registry date and an unknown registry key on a form', () => {
    const data = trainer();
    const twice = { ...data, statistics: { ...data.statistics, points: [...data.statistics.points, data.statistics.points[0]!] } };
    expect(issues({ ...file(), trainer: twice })).toContainEqual(expect.stringMatching(/трапляється двічі/));
    const ghost = { ...data, forms: data.forms.map((form) => ({ ...form, registryKey: 'fop' })) };
    expect(issues({ ...file(), trainer: ghost })).toContainEqual(expect.stringMatching(/немає ключа «fop»/));
  });

  it('rejects duplicate ids of norms, forms, criteria, startups and risks', () => {
    const data = trainer();
    const pairs: readonly [string, object][] = [
      ['Дублікат ID норми', { ...data, norms: [...data.norms, data.norms[0]!] }],
      ['Дублікат ID форми', { ...data, forms: [...data.forms, data.forms[0]!] }],
      ['Дублікат ID критерію', { ...data, criteria: [...data.criteria, data.criteria[0]!] }],
      ['Дублікат ID стартапу', { ...data, cases: [...data.cases, data.cases[0]!] }],
      ['Дублікат ID ризику', { ...data, agreement: { ...data.agreement, risks: [...data.agreement.risks, data.agreement.risks[0]!] } }],
    ];
    for (const [message, broken] of pairs) expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(message));
  });

  it('rejects a criterion whose options repeat', () => {
    const data = trainer();
    const [first, ...rest] = data.criteria;
    const broken = { ...data, criteria: [{ ...first!, options: [...first!.options, first!.options[0]!] }, ...rest] };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/дублікат варіанта «one»/));
  });

  it('requires every registry point to cite a described source', () => {
    expect(legalFormSourceIssues(parsed(), new Set(['other']))).toHaveLength(3);
    expect(legalFormSourceIssues(parsed(), new Set(['edrpou']))).toEqual([]);
    const data = trainer();
    const broken = { ...data, statistics: { ...data.statistics, points: data.statistics.points.map((point) => ({ ...point, source: 'ghost' })) } };
    expect(issues({ ...file(), trainer: broken })).toContainEqual(expect.stringMatching(/джерело «ghost» не описано/));
  });

  it('keeps the matrix trainer of p01 valid next to the new kind', () => {
    expect(issues({ ...file(), trainer: { ...trainer(), kind: 'unknown-trainer' } })).not.toEqual([]);
  });
});
