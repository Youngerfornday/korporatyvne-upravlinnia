import { describe, expect, it } from 'vitest';
import { CHOICE } from './__fixtures__/choice';
import { choiceSummaryText, defaultProfile, evaluateForms, profileIssues, summarizeChoice } from './choice';

const titleOf = (id: string) => CHOICE.forms.find((form) => form.id === id)?.short ?? id;
const verdicts = (profile: Record<string, string>) => {
  const result = evaluateForms(CHOICE, profile);
  if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join('; '));
  return result.value;
};

describe('defaultProfile', () => {
  it('picks the first option of every criterion', () => {
    expect(defaultProfile(CHOICE.criteria)).toEqual({ investor: 'founders', budget: 'small' });
  });

  it('skips a criterion without options', () => {
    expect(defaultProfile([{ id: 'empty', title: 'Порожній', question: 'Питання?', options: [] }])).toEqual({});
  });
});

describe('profileIssues', () => {
  it('reports a missing answer, an unknown option and an unknown criterion', () => {
    const issues = profileIssues(CHOICE.criteria, { budget: 'huge', ghost: 'x' });
    expect(issues.map((issue) => issue.code)).toEqual(['missing-answer', 'unknown-option', 'unknown-criterion']);
    expect(issues[0]?.message).toContain('Хто входить у капітал?');
  });

  it('accepts a complete profile', () => {
    expect(profileIssues(CHOICE.criteria, defaultProfile(CHOICE.criteria))).toEqual([]);
  });
});

describe('evaluateForms', () => {
  it('returns the profile issues instead of a verdict when an answer is missing', () => {
    const result = evaluateForms(CHOICE, { investor: 'founders' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error[0]?.criterion).toBe('budget');
  });

  it('blocks a form whose blocking rule matches, whatever else fits', () => {
    const [tov, prat] = verdicts({ investor: 'venture', budget: 'small' });
    expect(tov?.status).toBe('fits');
    expect(prat?.status).toBe('blocked');
    expect(prat?.reasons.map((reason) => reason.effect)).toEqual(['blocks', 'burden']);
    expect(prat?.reasons[0]?.optionLabel).toBe('Мінімальний');
  });

  it('marks a form costly when only a burden rule matches', () => {
    const [, prat] = verdicts({ investor: 'venture', budget: 'large' });
    expect(prat?.status).toBe('costly');
    expect(prat?.reasons).toHaveLength(1);
    expect(prat?.reasons[0]?.norm).toBe('at-kapital');
  });

  it('treats a form without matching rules as fitting', () => {
    const [, prat] = verdicts({ investor: 'founders', budget: 'large' });
    expect(prat?.status).toBe('fits');
    expect(prat?.reasons).toEqual([]);
  });

  it('ignores a rule that names a criterion or option outside the definition', () => {
    const broken = { ...CHOICE, rules: [...CHOICE.rules, { form: 'tov', criterion: 'ghost', option: 'x', effect: 'blocks' as const, reason: 'Ні.', norm: 'n' }] };
    const result = evaluateForms(broken, { investor: 'founders', budget: 'small' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.status).toBe('fits');
  });
});

describe('summarizeChoice', () => {
  it('splits forms by status and describes them for aria-live', () => {
    const summary = summarizeChoice(verdicts({ investor: 'venture', budget: 'small' }));
    expect(summary).toEqual({ fits: ['tov'], costly: [], blocked: ['prat'] });
    expect(choiceSummaryText(summary, titleOf)).toBe('Підходить: ТОВ. Не підходить: ПрАТ.');
  });

  it('names the costly forms separately', () => {
    const text = choiceSummaryText(summarizeChoice(verdicts({ investor: 'venture', budget: 'large' })), titleOf);
    expect(text).toContain('Можна, але дорожче: ПрАТ.');
  });

  it('warns when nothing is left', () => {
    const summary = { fits: [], costly: [], blocked: ['tov', 'prat'] };
    expect(choiceSummaryText(summary, titleOf)).toContain('не лишилося жодної форми');
  });

  it('says so when every remaining form carries a caveat', () => {
    expect(choiceSummaryText({ fits: [], costly: ['prat'], blocked: [] }, titleOf)).toContain('Форм без застережень немає');
  });
});
