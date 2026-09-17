import { describe, expect, it } from 'vitest';
import { applyTrainerCompletion } from './use-trainer-task';

const event = { id: 'trainer:task:variant-1', type: 'trainer-completed' as const, activityId: 'task', score: 1, variantId: 'variant-1' };
const success = { ok: true as const, value: { state: {} as never, duplicate: false, xpGained: 60, newBadges: [], levelBefore: {} as never, levelAfter: {} as never, leveledUp: false } };

describe('applyTrainerCompletion', () => {
  it('дозволяє повторити після відсутнього клієнта', () => {
    expect(applyTrainerCompletion(null, event, null)).toMatchObject({ status: 'unavailable', nextApplied: null });
  });

  it('не встановлює прапор після невдалого apply', () => {
    const client = { getState: () => ({ recentEventIds: [], activities: {} } as never), apply: () => ({ ok: false as const, error: { code: 'invalid-state' as const, message: 'не збережено' } }) };
    expect(applyTrainerCompletion(client, event, null)).toMatchObject({ status: 'failed', nextApplied: null });
  });

  it('встановлює прапор лише після успішного apply', () => {
    const client = { getState: () => ({ recentEventIds: [], activities: {} } as never), apply: () => success };
    expect(applyTrainerCompletion(client, event, null)).toMatchObject({ status: 'saved', nextApplied: 'variant-1' });
  });
});
