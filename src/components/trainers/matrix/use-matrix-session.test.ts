import { describe, expect, it } from 'vitest';
import { applyMatrixCompletion } from './use-matrix-session';

const event = { id: 'trainer:p01-model-matrix:1', type: 'trainer-completed' as const, activityId: 'p01-model-matrix', score: 1 };
const success = { ok: true as const, value: { state: {} as never, duplicate: false, xpGained: 60, newBadges: [], levelBefore: {} as never, levelAfter: {} as never, leveledUp: false } };

describe('applyMatrixCompletion', () => {
  it('не блокує майбутній запис без клієнта', () => {
    expect(applyMatrixCompletion(null, event, 'attempt-1', null)).toMatchObject({ status: 'unavailable', nextApplied: null });
  });

  it('не встановлює прапор після відхиленого apply', () => {
    const client = { apply: () => ({ ok: false as const, error: { code: 'invalid-state' as const, message: 'не збережено' } }) };
    expect(applyMatrixCompletion(client, event, 'attempt-1', null)).toMatchObject({ status: 'failed', nextApplied: null });
  });

  it('встановлює прапор після успішного apply', () => {
    const client = { apply: () => success };
    expect(applyMatrixCompletion(client, event, 'attempt-1', null)).toMatchObject({ status: 'saved', nextApplied: 'attempt-1' });
  });
});
