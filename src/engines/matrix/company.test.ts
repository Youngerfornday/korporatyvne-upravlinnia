import { describe, expect, it } from 'vitest';
import { COMPANY_TASK, MATRIX } from './__fixtures__/matrix';
import { REQUIRED_KEY_FEATURES, gradeCompanyTask } from './company';

describe('gradeCompanyTask', () => {
  it('правильна модель і дві ключові ознаки — «right» з розбором ключових ознак для правильної моделі', () => {
    const result = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: 'insider', features: ['board', 'ownership'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      taskId: 'acme',
      state: 'right',
      modelCorrect: true,
      chosenModel: 'insider',
      correctModel: 'insider',
      keyChosen: ['board', 'ownership'],
      otherChosen: [],
      explanation: 'Концентрована власність і дворівнева рада.',
      source: 'src-b',
    });
    expect(result.value.keyFeatures).toEqual([
      { featureId: 'ownership', title: 'Структура власності', statement: 'Концентрована', chosen: true },
      { featureId: 'board', title: 'Будова ради', statement: 'Дворівнева', chosen: true },
      { featureId: 'employees', title: 'Роль працівників', statement: 'Співучасть за законом', chosen: false },
    ]);
  });

  it('правильна модель, але ознаки не ключові — «partial»', () => {
    const task = { ...COMPANY_TASK, keyFeatures: ['ownership', 'board'] };
    const result = gradeCompanyTask(task, MATRIX, { model: 'insider', features: ['ownership', 'employees'] });
    expect(result.ok && result.value.state).toBe('partial');
    expect(result.ok && result.value.otherChosen).toEqual(['employees']);
  });

  it('хибна модель — «wrong» навіть із ключовими ознаками', () => {
    const result = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: 'family', features: ['ownership', 'board'] });
    expect(result.ok && result.value.state).toBe('wrong');
    expect(result.ok && result.value.modelCorrect).toBe(false);
  });

  it('повертає зрозумілі помилки для неповної відповіді', () => {
    const noModel = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: null, features: ['ownership', 'board'] });
    expect(!noModel.ok && noModel.error).toEqual({ code: 'no-model', message: 'Оберіть модель, до якої належить компанія.' });

    const oneFeature = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: 'insider', features: ['ownership'] });
    expect(!oneFeature.ok && oneFeature.error.code).toBe('feature-count');
    expect(!oneFeature.ok && oneFeature.error.message).toContain(String(REQUIRED_KEY_FEATURES));

    const unknownModel = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: 'ghost', features: ['ownership', 'board'] });
    expect(!unknownModel.ok && unknownModel.error.code).toBe('unknown-model');

    const unknownFeature = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: 'insider', features: ['ownership', 'ghost'] });
    expect(!unknownFeature.ok && unknownFeature.error.code).toBe('unknown-feature');

    const duplicate = gradeCompanyTask(COMPANY_TASK, MATRIX, { model: 'insider', features: ['board', 'board'] });
    expect(!duplicate.ok && duplicate.error.code).toBe('feature-count');
  });

  it('кидає помилку програміста, якщо завдання посилається на невідому модель чи ознаку', () => {
    expect(() => gradeCompanyTask({ ...COMPANY_TASK, answer: 'ghost' }, MATRIX, { model: 'insider', features: ['ownership', 'board'] })).toThrow(/ghost/);
    expect(() => gradeCompanyTask({ ...COMPANY_TASK, keyFeatures: ['ghost', 'board'] }, MATRIX, { model: 'insider', features: ['ownership', 'board'] })).toThrow(/ghost/);
  });
});
