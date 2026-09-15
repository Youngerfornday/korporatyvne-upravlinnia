import { describe, expect, it } from 'vitest';
import { zoriaScenario } from './__fixtures__/zoria';
import { advanceScene, answerScene, createMeetingSimulation, currentScene, meetingScore, type MeetingSimulation } from './machine';
import type { SceneAnswer } from './scenes';

function simulation(scenario = zoriaScenario()): MeetingSimulation {
  const result = createMeetingSimulation(scenario);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const CORRECT: Readonly<Record<string, SceneAnswer>> = {
  registration: 7_500,
  quorum: true,
  'item-annual-report': true,
  'item-charter-amendments': false,
  'item-supervisory-board': ['c1', 'c2', 'c4'],
};

function playThrough(sim: MeetingSimulation, answers: Readonly<Record<string, SceneAnswer>>): MeetingSimulation['state'] {
  let state = sim.state;
  while (state.status === 'in-progress') {
    const scene = currentScene(sim.scenes, state);
    const answer = answers[scene.id];
    if (scene.question && answer !== undefined) state = unwrap(answerScene(sim.scenes, state, answer));
    state = unwrap(advanceScene(sim.scenes, state));
  }
  return state;
}

describe('createMeetingSimulation: scenes', () => {
  it('builds scenes in meeting order with a heading for focus and a question where the learner decides', () => {
    // Act
    const { scenes, state } = simulation();

    // Assert
    expect(scenes.map((scene) => [scene.id, scene.kind, scene.question?.kind ?? null])).toEqual([
      ['briefing', 'briefing', null],
      ['registration', 'registration', 'number'],
      ['quorum', 'quorum', 'yes-no'],
      ['item-annual-report', 'resolution', 'yes-no'],
      ['item-charter-amendments', 'resolution', 'yes-no'],
      ['item-supervisory-board', 'election', 'select-candidates'],
      ['protocol', 'protocol', null],
    ]);
    expect(scenes.every((scene) => scene.title.length > 0 && scene.explanation.length > 0)).toBe(true);
    expect(state).toEqual({ scenarioId: 'zoria-annual-meeting', sceneIndex: 0, records: {}, status: 'in-progress' });
  });

  it('explains the numbers in Ukrainian for aria-live announcements', () => {
    const { scenes } = simulation();
    const byId = (id: string) => scenes.find((scene) => scene.id === id)?.explanation ?? '';
    expect(byId('registration')).toContain('Мельник І.');
    expect(byId('quorum')).toMatch(/5 001/);
    expect(byId('item-charter-amendments')).toMatch(/5 626/);
    expect(byId('item-supervisory-board')).toContain('Кравець Д.');
    expect(byId('protocol')).toContain('не прийнято');
  });

  it('skips agenda items when there is no quorum', () => {
    const scenario = { ...zoriaScenario(), attendance: [{ shareholderId: 'agroinvest', via: 'personal' as const }] };
    const { scenes } = simulation(scenario);
    expect(scenes.map((scene) => scene.id)).toEqual(['briefing', 'registration', 'quorum', 'protocol']);
    expect(scenes.find((scene) => scene.id === 'protocol')?.explanation).toContain('не відбулися');
  });

  it('asks to select nobody when the board is not formed', () => {
    const base = zoriaScenario();
    const agenda = base.agenda.map((entry) =>
      entry.kind === 'cumulative-election' ? { ...entry, ballots: [{ shareholderId: 'agroinvest', allocation: { c1: 12_600 } }] } : entry,
    );
    const scene = simulation({ ...base, agenda }).scenes.find((candidate) => candidate.id === 'item-supervisory-board');
    expect(scene?.question).toMatchObject({ kind: 'select-candidates', answer: [] });
  });

  it('rejects an invalid scenario', () => {
    expect(createMeetingSimulation({ ...zoriaScenario(), shareholders: [] })).toMatchObject({ ok: false, error: { code: 'invalid-scenario' } });
  });
});

describe('meeting simulation state machine', () => {
  it('records answers, requires an answer before moving on and finishes with a full score', () => {
    // Arrange
    const sim = simulation();

    // Act
    const finished = playThrough(sim, CORRECT);

    // Assert
    expect(finished.status).toBe('finished');
    expect(meetingScore(sim.scenes, finished)).toEqual({ correct: 5, total: 5, score: 1 });
  });

  it('marks wrong answers and compares candidate sets regardless of order', () => {
    const sim = simulation();
    const state = playThrough(sim, { ...CORRECT, registration: 8_500, 'item-supervisory-board': ['c4', 'c2', 'c1'] });
    expect(state.records['registration']).toEqual({ answer: 8_500, correct: false });
    expect(state.records['item-supervisory-board']?.correct).toBe(true);
    expect(meetingScore(sim.scenes, state)).toEqual({ correct: 4, total: 5, score: 0.8 });
  });

  it('returns typed errors for invalid transitions without changing the state', () => {
    const sim = simulation();
    expect(answerScene(sim.scenes, sim.state, true)).toMatchObject({ ok: false, error: { code: 'no-question' } });
    const atRegistration = unwrap(advanceScene(sim.scenes, sim.state));
    expect(advanceScene(sim.scenes, atRegistration)).toMatchObject({ ok: false, error: { code: 'answer-required' } });
    expect(answerScene(sim.scenes, atRegistration, true)).toMatchObject({ ok: false, error: { code: 'wrong-answer-type' } });
    const answered = unwrap(answerScene(sim.scenes, atRegistration, 7_500));
    expect(answerScene(sim.scenes, answered, 7_400)).toMatchObject({ ok: false, error: { code: 'already-answered' } });
    const finished = playThrough(sim, CORRECT);
    expect(advanceScene(sim.scenes, finished)).toMatchObject({ ok: false, error: { code: 'finished' } });
    expect(answerScene(sim.scenes, finished, 1)).toMatchObject({ ok: false, error: { code: 'finished' } });
  });

  it('validates candidate selections against the options', () => {
    const sim = simulation();
    let state = sim.state;
    for (let step = 0; step < 5; step += 1) {
      const scene = currentScene(sim.scenes, state);
      const answer = CORRECT[scene.id];
      if (scene.question && answer !== undefined) state = unwrap(answerScene(sim.scenes, state, answer));
      state = unwrap(advanceScene(sim.scenes, state));
    }
    expect(currentScene(sim.scenes, state).id).toBe('item-supervisory-board');
    expect(answerScene(sim.scenes, state, ['ghost'])).toMatchObject({ ok: false, error: { code: 'wrong-answer-type' } });
    expect(answerScene(sim.scenes, state, 3)).toMatchObject({ ok: false, error: { code: 'wrong-answer-type' } });
  });
});
