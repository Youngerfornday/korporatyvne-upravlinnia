import { describe, expect, it } from 'vitest';
import { createFakeScormApi, type FakeScormApi } from './__fixtures__/fake-scorm-api';
import { FIXED_NOW, LATER_NOW, sampleProgress } from './__fixtures__/sample-state';
import { attachScormLifecycle, createScormProgressStore, scormNoticeText, type ScormNotice, type ScormProgressStoreOptions } from './scorm-store';
import { COMPRESSED_PREFIX } from './suspend-data';
import { createEmptyProgress, type ProgressState } from './state';

const ACTIVITY = 'p01-model-matrix';

function withActivity(bestScore: number, base: ProgressState = createEmptyProgress(FIXED_NOW)): ProgressState {
  return {
    ...base,
    xp: 54,
    xpLedger: { [`trainer:${ACTIVITY}`]: 54 },
    recentEventIds: ['trainer:p01-model-matrix:1757844000000'],
    activities: { [ACTIVITY]: { attempts: 1, bestScore, completedAt: FIXED_NOW.toISOString() } },
  };
}

interface Harness {
  readonly api: FakeScormApi;
  readonly notices: ScormNotice[];
  readonly store: ReturnType<typeof createScormProgressStore>;
}

function harness(api: FakeScormApi | null = createFakeScormApi(), options: Partial<ScormProgressStoreOptions> = {}): Harness {
  const notices: ScormNotice[] = [];
  const store = createScormProgressStore({
    activityId: ACTIVITY,
    masteryPercent: 90,
    getApi: () => api,
    now: () => LATER_NOW,
    onNotice: (notice) => notices.push(notice),
    ...options,
  });
  return { api: api as FakeScormApi, notices, store };
}

describe('createScormProgressStore: initialize → save → commit → reload', () => {
  it('initializes once, starts empty and marks the lesson incomplete', () => {
    // Arrange
    const { api, store } = harness();

    // Act
    const loaded = store.load();
    store.load();

    // Assert
    expect(loaded).toEqual({ status: 'empty', state: createEmptyProgress(LATER_NOW) });
    expect(api.calls.filter((call) => call === 'LMSInitialize')).toHaveLength(1);
    expect(api.initialized()).toBe(true);
    expect(store.isPersistent()).toBe(true);
    expect(api.persisted()['cmi.core.lesson_status']).toBe('incomplete');
  });

  it('writes suspend_data, score and status and commits them to the LMS', () => {
    // Arrange
    const { api, store } = harness();
    store.load();

    // Act
    const saved = store.save(withActivity(40 / 44));

    // Assert
    expect(saved.status).toBe('saved');
    const persisted = api.persisted();
    expect(JSON.parse(persisted['cmi.suspend_data'] ?? '')).toEqual({ ...withActivity(40 / 44), updatedAt: LATER_NOW.toISOString() });
    expect(persisted['cmi.core.score.raw']).toBe('90.91');
    expect(persisted['cmi.core.score.min']).toBe('0');
    expect(persisted['cmi.core.score.max']).toBe('100');
    expect(persisted['cmi.core.lesson_status']).toBe('passed');
    expect(persisted['cmi.core.exit']).toBe('suspend');
  });

  it('restores the same state after the LMS relaunches the SCO', () => {
    // Arrange
    const first = harness();
    first.store.load();
    first.store.save(withActivity(0.5));
    first.store.terminate();

    // Act
    const second = harness(first.api.relaunch());
    const reloaded = second.store.load();

    // Assert
    expect(reloaded).toEqual({ status: 'loaded', state: { ...withActivity(0.5), updatedAt: LATER_NOW.toISOString() } });
    expect(second.api.LMSGetValue('cmi.core.lesson_status')).toBe('failed');
    expect(second.api.LMSGetValue('cmi.core.score.raw')).toBe('50');
    expect(second.api.LMSGetValue('cmi.core.entry')).toBe('resume');
  });

  it('keeps the lesson incomplete while the trainer has no recorded result', () => {
    // Arrange
    const { api, store } = harness();

    // Act
    store.save({ ...sampleProgress(), activities: {} });

    // Assert
    expect(api.persisted()['cmi.core.lesson_status']).toBe('incomplete');
    expect(api.persisted()['cmi.core.score.raw']).toBe('');
  });

  it('does not downgrade a status the LMS already has when loading', () => {
    // Arrange
    const api = createFakeScormApi({ lessonStatus: 'passed', suspendData: JSON.stringify(withActivity(1)) });
    const { store } = harness(api);

    // Act
    store.load();

    // Assert
    expect(api.calls).not.toContain('LMSSetValue cmi.core.lesson_status');
  });

  it('prefers the mastery score provided by the LMS over the packaged one', () => {
    // Arrange
    const { api, store } = harness(createFakeScormApi({ masteryScore: '60' }));

    // Act
    store.save(withActivity(0.7));

    // Assert
    expect(api.persisted()['cmi.core.lesson_status']).toBe('passed');
  });

  it('ignores a non-numeric LMS mastery score', () => {
    // Arrange
    const { api, store } = harness(createFakeScormApi({ masteryScore: 'n/a' }));

    // Act
    store.save(withActivity(0.7));

    // Assert
    expect(api.persisted()['cmi.core.lesson_status']).toBe('failed');
  });

  it('reports migrated data from an older schema', () => {
    // Arrange
    const api = createFakeScormApi({ suspendData: '{"schemaVersion":1,"points":7}' });
    const { store } = harness(api, { migrations: { 1: () => ({ ...createEmptyProgress(FIXED_NOW), xp: 7 }) } });

    // Act
    const loaded = store.load();

    // Assert
    expect(loaded.status).toBe('migrated');
    expect(loaded.state.xp).toBe(7);
  });

  it('never shares objects with the caller', () => {
    // Arrange
    const { store } = harness();
    const state = withActivity(1);

    // Act
    const saved = store.save(state);
    const loaded = store.load();

    // Assert
    expect(saved.status === 'saved' && saved.state).not.toBe(state);
    expect(loaded.state).not.toBe(saved.status === 'saved' ? saved.state : null);
    expect(state.updatedAt).toBe(FIXED_NOW.toISOString());
  });

  it('does not look for the API until the first call', () => {
    // Arrange
    let lookups = 0;

    // Act
    createScormProgressStore({ activityId: ACTIVITY, masteryPercent: 90, getApi: () => ((lookups += 1), null) });

    // Assert
    expect(lookups).toBe(0);
  });
});

describe('createScormProgressStore: the 4096-character suspend_data limit', () => {
  it('compresses a long history transparently', () => {
    // Arrange
    const { api, notices, store } = harness();
    const state = { ...withActivity(1), recentEventIds: Array.from({ length: 100 }, (_, index) => `trainer:quorum-calculator:variant-${index}-q${index * 31}`) };

    // Act
    const saved = store.save(state);
    const reloaded = harness(api.relaunch()).store.load();

    // Assert
    expect(saved.status).toBe('saved');
    expect(api.persisted()['cmi.suspend_data']?.startsWith(COMPRESSED_PREFIX)).toBe(true);
    expect(reloaded.state.recentEventIds).toEqual(state.recentEventIds);
    expect(notices).toEqual([]);
  });

  it('trims the oldest event history with a warning when compression is not enough', () => {
    // Arrange
    const { api, notices, store } = harness(createFakeScormApi(), { suspendDataLimit: 450 });
    const state = { ...withActivity(1), recentEventIds: Array.from({ length: 30 }, (_, index) => `e${(index * 2654435761).toString(36)}x${(index * 40503).toString(36)}`) };

    // Act
    const saved = store.save(state);

    // Assert
    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') return;
    expect(saved.state.recentEventIds.length).toBeLessThan(30);
    expect(saved.state.activities).toEqual(state.activities);
    expect(notices).toEqual([{ code: 'history-trimmed', droppedEvents: 30 - saved.state.recentEventIds.length }]);
    expect(api.persisted()['cmi.suspend_data']?.length).toBeLessThanOrEqual(450);
  });

  it('rejects a state that cannot fit even without history', () => {
    // Arrange
    const { api, notices, store } = harness(createFakeScormApi(), { suspendDataLimit: 60 });

    // Act
    const saved = store.save(withActivity(1));

    // Assert
    expect(saved).toEqual({ status: 'rejected', reason: 'too-large' });
    expect(notices).toEqual([{ code: 'too-large' }]);
    expect(api.calls).not.toContain('LMSCommit');
  });

  it('rejects an invalid state without touching the LMS', () => {
    // Arrange
    const { api, store } = harness();

    // Act
    const saved = store.save({ ...withActivity(1), xp: -1 });

    // Assert
    expect(saved).toEqual({ status: 'rejected', reason: 'invalid-state' });
    expect(api.calls).not.toContain('LMSCommit');
  });
});

describe('createScormProgressStore: without a working LMS', () => {
  it('falls back to memory with one notice when no API is found', () => {
    // Arrange
    const { notices, store } = harness(null);

    // Act
    const empty = store.load();
    const saved = store.save(withActivity(1));
    const loaded = store.load();

    // Assert
    expect(empty.status).toBe('empty');
    expect(saved).toEqual({ status: 'memory-only', reason: 'unavailable', state: { ...withActivity(1), updatedAt: LATER_NOW.toISOString() } });
    expect(loaded).toEqual({ status: 'memory-only', state: { ...withActivity(1), updatedAt: LATER_NOW.toISOString() } });
    expect(store.isPersistent()).toBe(false);
    expect(notices).toEqual([{ code: 'no-api' }]);
  });

  it('treats a failed LMSInitialize like a missing API', () => {
    // Arrange
    const { notices, store } = harness(createFakeScormApi({ failInitialize: true }));

    // Act
    store.load();
    const saved = store.save(withActivity(1));

    // Assert
    expect(saved.status).toBe('memory-only');
    expect(notices).toEqual([{ code: 'initialize-failed', error: '101' }]);
  });

  it('keeps the newest state in memory when the LMS rejects a write', () => {
    // Arrange
    const { notices, store } = harness(createFakeScormApi({ failSetOn: ['cmi.suspend_data'] }));

    // Act
    const saved = store.save(withActivity(1));
    const loaded = store.load();

    // Assert
    expect(saved.status === 'memory-only' && saved.reason).toBe('write-failed');
    expect(loaded.status).toBe('memory-only');
    expect(store.isPersistent()).toBe(false);
    expect(notices).toEqual([{ code: 'lms-error', operation: 'LMSSetValue cmi.suspend_data', error: '101' }]);
  });

  it('reports a failed commit and recovers on the next successful save', () => {
    // Arrange
    const api = createFakeScormApi({ failCommit: true });
    const { notices, store } = harness(api);

    // Act
    const failed = store.save(withActivity(0.5));
    const persistentAfterFailure = store.isPersistent();
    api.setCommitFailing(false);
    const saved = store.save(withActivity(1));

    // Assert
    expect(failed.status === 'memory-only' && failed.reason).toBe('write-failed');
    // Перший коміт — позначка «incomplete» під час запуску, другий — збереження.
    expect(notices).toEqual([
      { code: 'lms-error', operation: 'LMSCommit', error: '101' },
      { code: 'lms-error', operation: 'LMSCommit', error: '101' },
    ]);
    expect(persistentAfterFailure).toBe(false);
    expect(saved.status).toBe('saved');
    expect(store.isPersistent()).toBe(true);
    expect(store.load().status).toBe('loaded');
  });

  it('recovers from unreadable suspend_data with an empty state', () => {
    // Arrange
    const { store } = harness(createFakeScormApi({ suspendData: '{not json' }));

    // Act
    const loaded = store.load();

    // Assert
    expect(loaded).toEqual({ status: 'recovered', issue: 'invalid-json', backupSaved: false, state: createEmptyProgress(LATER_NOW) });
  });

  it('does not throw when the API itself throws', () => {
    // Arrange
    const api = createFakeScormApi();
    const throwing = { ...api, LMSCommit: () => { throw new Error('network down'); } };
    const notices: ScormNotice[] = [];
    const store = createScormProgressStore({ activityId: ACTIVITY, masteryPercent: 90, getApi: () => throwing, onNotice: (notice) => notices.push(notice) });

    // Act
    const saved = store.save(withActivity(1));

    // Assert
    expect(saved.status).toBe('memory-only');
    expect(notices.at(-1)).toEqual({ code: 'lms-error', operation: 'LMSCommit', error: 'network down' });
  });
});

describe('createScormProgressStore: flush, terminate, clear', () => {
  it('flush commits the current data', () => {
    // Arrange
    const { api, store } = harness();
    store.load();

    // Act
    store.flush();

    // Assert
    expect(api.calls.at(-1)).toBe('LMSCommit');
  });

  it('flush does nothing without an LMS', () => {
    // Arrange
    const { store } = harness(null);

    // Act and Assert
    expect(() => store.flush()).not.toThrow();
  });

  it('terminate stores exit, session time and finishes exactly once', () => {
    // Arrange
    let clock = FIXED_NOW;
    const api = createFakeScormApi();
    const store = createScormProgressStore({ activityId: ACTIVITY, masteryPercent: 90, getApi: () => api, now: () => clock });
    store.load();
    clock = new Date(FIXED_NOW.getTime() + 125_000);

    // Act
    store.terminate();
    store.terminate();

    // Assert
    expect(api.finished()).toBe(true);
    expect(api.calls.filter((call) => call === 'LMSFinish')).toHaveLength(1);
    expect(api.calls).toContain('LMSSetValue cmi.core.session_time');
    expect(api.persisted()['cmi.core.exit']).toBe('suspend');
    expect(store.isPersistent()).toBe(false);
    expect(store.save(withActivity(1)).status).toBe('memory-only');
  });

  it('terminate without a started session does not initialize the LMS', () => {
    // Arrange
    const { api, store } = harness();

    // Act
    store.terminate();

    // Assert
    expect(api.calls).toEqual([]);
  });

  it('clear empties suspend_data but keeps the LMS grade', () => {
    // Arrange
    const { api, store } = harness();
    store.save(withActivity(1));

    // Act
    const cleared = store.clear();

    // Assert
    expect(cleared).toEqual({ status: 'cleared' });
    expect(api.persisted()['cmi.suspend_data']).toBe('');
    expect(api.persisted()['cmi.core.score.raw']).toBe('100');
    expect(store.load().status).toBe('empty');
  });

  it('clear without an LMS only drops the memory copy', () => {
    // Arrange
    const { store } = harness(null);
    store.save(withActivity(1));

    // Act and Assert
    expect(store.clear()).toEqual({ status: 'memory-only' });
    expect(store.load().status).toBe('empty');
  });

  it('clear reports a failed commit', () => {
    // Arrange
    const api = createFakeScormApi();
    const { store } = harness(api);
    store.load();
    api.setCommitFailing(true);

    // Act and Assert
    expect(store.clear()).toEqual({ status: 'memory-only' });
  });
});

describe('attachScormLifecycle', () => {
  it('terminates the session on pagehide and can be detached', () => {
    // Arrange
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const { api, store } = harness();
    store.load();

    // Act
    const detach = attachScormLifecycle(store, target);
    listeners.get('pagehide')?.();

    // Assert
    expect(api.finished()).toBe(true);
    detach();
    expect(listeners.size).toBe(0);
  });
});

describe('scormNoticeText', () => {
  it('explains every notice in Ukrainian', () => {
    const notices: ScormNotice[] = [
      { code: 'no-api' },
      { code: 'initialize-failed', error: '101' },
      { code: 'lms-error', operation: 'LMSCommit', error: '101' },
      { code: 'history-trimmed', droppedEvents: 3 },
      { code: 'too-large' },
    ];
    for (const notice of notices) expect(scormNoticeText(notice)).toMatch(/[а-яіїєґ]/i);
  });
});
