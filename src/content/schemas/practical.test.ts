import { describe, expect, it } from 'vitest';
import { PracticalFileSchema, matrixCellCount, matrixIssues, sourceRefIssues } from './practical';

const MODELS = ['anglo-american', 'german'] as const;
const FEATURES = [
  'ownership-structure',
  'role-of-banks',
  'board-structure',
  'employees',
  'financing',
  'disclosure',
  'market-for-control',
  'shareholder-protection',
  'executive-pay',
  'state-role',
] as const;

const source = (id = 'oecd-2023') => ({
  id,
  type: 'standard',
  title: 'G20/OECD Principles of Corporate Governance 2023',
  url: 'https://www.oecd.org/en/publications/g20-oecd-principles-of-corporate-governance-2023_ed750b30-en.html',
  checkedAt: '2026-09-15',
});

const model = (id: string) => ({
  id,
  title: `Модель ${id}`,
  short: id,
  countries: ['Країна'],
  summary: 'Узагальнена характеристика моделі.',
  examples: [{ company: `Компанія ${id}`, country: 'Країна', note: 'Приклад.', url: 'https://example.com/', checkedAt: '2026-09-15' }],
});

const feature = (id: string) => ({
  id,
  title: `Ознака ${id}`,
  cells: MODELS.map((m) => ({ model: m, statement: `${id} у моделі ${m}`, explanation: 'Пояснення.', source: 'oecd-2023' })),
});

const file = () => ({
  id: 'p01',
  title: 'Матриця моделей корпоративного управління',
  intro: 'Зіставте ознаки з моделями.',
  updatedAt: '2026-09-16',
  sources: [source()],
  trainer: {
    kind: 'model-matrix',
    models: MODELS.map(model),
    features: FEATURES.map(feature),
    companyTasks: [
      {
        id: 'vw',
        company: 'Volkswagen AG',
        description: 'Опис компанії.',
        answer: 'german',
        keyFeatures: ['ownership-structure', 'employees'],
        explanation: 'Чому саме ця модель.',
        source: 'oecd-2023',
      },
    ],
    essay: { prompt: 'Яка модель ближча до українських АТ?', maxWords: 300, expectations: ['Теза', 'Два аргументи'] },
  },
});

const issues = (data: unknown) => {
  const result = PracticalFileSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('PracticalFileSchema', () => {
  it('accepts a complete model matrix and applies the default status', () => {
    const parsed = PracticalFileSchema.parse(file());
    expect(parsed.status).toBe('draft');
    expect(matrixCellCount(parsed.trainer)).toBe(MODELS.length * FEATURES.length);
  });

  it('rejects a matrix with fewer than ten features', () => {
    const data = file();
    expect(issues({ ...data, trainer: { ...data.trainer, features: data.trainer.features.slice(0, 9) } })).not.toEqual([]);
  });

  it('reports a feature that misses a model or names an unknown model', () => {
    const data = file();
    const [first, ...rest] = data.trainer.features;
    const missing = { ...first!, cells: first!.cells.filter((cell) => cell.model !== 'german') };
    expect(issues({ ...data, trainer: { ...data.trainer, features: [missing, ...rest] } })).toContainEqual(expect.stringMatching(/немає клітинки.*german/));
    const unknown = { ...first!, cells: [...first!.cells, { ...first!.cells[0]!, model: 'japanese', statement: 'інше' }] };
    expect(issues({ ...data, trainer: { ...data.trainer, features: [unknown, ...rest] } })).toContainEqual(expect.stringMatching(/невідома модель.*japanese/));
  });

  it('rejects duplicate cells and identical statements within a feature', () => {
    const data = file();
    const [first, ...rest] = data.trainer.features;
    const duplicate = { ...first!, cells: [...first!.cells, { ...first!.cells[0]! }] };
    const found = issues({ ...data, trainer: { ...data.trainer, features: [duplicate, ...rest] } });
    expect(found).toContainEqual(expect.stringMatching(/описана двічі/));
    expect(found).toContainEqual(expect.stringMatching(/однакові формулювання/));
  });

  it('requires every cell and company task to cite a described source', () => {
    const data = file();
    const parsed = PracticalFileSchema.parse(data);
    expect(sourceRefIssues(parsed.trainer, new Set(['other']))).toHaveLength(MODELS.length * FEATURES.length + 1);
    const [task] = data.trainer.companyTasks;
    expect(issues({ ...data, trainer: { ...data.trainer, companyTasks: [{ ...task!, source: 'ghost' }] } })).toContainEqual(expect.stringMatching(/джерело «ghost»/));
  });

  it('checks company tasks against models and features', () => {
    const parsed = PracticalFileSchema.parse(file());
    const broken = {
      ...parsed.trainer,
      companyTasks: [{ ...parsed.trainer.companyTasks[0]!, answer: 'family', keyFeatures: ['ownership-structure', 'ghost-feature'] }],
    };
    const messages = matrixIssues(broken).map((issue) => issue.message);
    expect(messages).toContainEqual(expect.stringMatching(/невідома модель «family»/));
    expect(messages).toContainEqual(expect.stringMatching(/невідома ознака «ghost-feature»/));
  });

  it('rejects duplicate model, feature, task and source ids', () => {
    const data = file();
    const trainer = data.trainer;
    expect(issues({ ...data, trainer: { ...trainer, models: [...trainer.models, trainer.models[0]!] } })).toContainEqual(expect.stringMatching(/Дублікат ID моделі/));
    expect(issues({ ...data, trainer: { ...trainer, features: [...trainer.features, trainer.features[0]!] } })).toContainEqual(expect.stringMatching(/Дублікат ID ознаки/));
    expect(issues({ ...data, trainer: { ...trainer, companyTasks: [...trainer.companyTasks, trainer.companyTasks[0]!] } })).toContainEqual(expect.stringMatching(/Дублікат ID завдання/));
    expect(issues({ ...data, sources: [source(), source()] })).toContainEqual(expect.stringMatching(/Дублікат ID джерела/));
  });

  it('rejects an essay without expectations or with a tiny word limit', () => {
    const data = file();
    expect(issues({ ...data, trainer: { ...data.trainer, essay: { ...data.trainer.essay, expectations: ['одне'] } } })).not.toEqual([]);
    expect(issues({ ...data, trainer: { ...data.trainer, essay: { ...data.trainer.essay, maxWords: 50 } } })).not.toEqual([]);
  });
});
