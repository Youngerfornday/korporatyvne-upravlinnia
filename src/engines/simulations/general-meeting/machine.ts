import { DEFAULT_MEETING_RULES, type MeetingRules } from '../../calculators/meeting-rules';
import { err, ok, type Result } from '../../shared/result';
import { registerShareholders, validateScenario } from './registration';
import { buildMeetingScenes, type MeetingScene, type SceneAnswer, type SceneQuestion, type ScenarioError } from './scenes';
import type { MeetingScenario } from './types';

/**
 * Скінченний автомат симуляції: сцени йдуть по черзі; сцену з питанням не можна пройти без відповіді;
 * відповідь фіксується один раз (як бюлетень). Стан — незмінні серіалізовні дані.
 */
export interface SceneRecord {
  readonly answer: SceneAnswer;
  readonly correct: boolean;
}

export interface MeetingSimulationState {
  readonly scenarioId: string;
  readonly sceneIndex: number;
  readonly records: Readonly<Record<string, SceneRecord>>;
  readonly status: 'in-progress' | 'finished';
}

export interface MeetingSimulation {
  readonly scenes: readonly MeetingScene[];
  readonly state: MeetingSimulationState;
}

export type SimulationErrorCode = 'finished' | 'no-question' | 'already-answered' | 'answer-required' | 'wrong-answer-type';

export interface SimulationError {
  readonly code: SimulationErrorCode;
  readonly message: string;
}

const MESSAGES: Readonly<Record<SimulationErrorCode, string>> = {
  finished: 'Симуляцію завершено.',
  'no-question': 'На цьому етапі відповідати не потрібно — перейдіть далі.',
  'already-answered': 'Відповідь на цьому етапі вже зафіксовано.',
  'answer-required': 'Спершу дайте відповідь на питання цього етапу.',
  'wrong-answer-type': 'Відповідь не підходить до питання: перевірте формат.',
};

function simulationError(code: SimulationErrorCode): { readonly ok: false; readonly error: SimulationError } {
  return err({ code, message: MESSAGES[code] });
}

export function createMeetingSimulation(
  scenario: MeetingScenario,
  rules: MeetingRules = DEFAULT_MEETING_RULES,
): Result<MeetingSimulation, ScenarioError> {
  const problem = validateScenario(scenario);
  if (problem) return err({ code: 'invalid-scenario', message: problem });
  const scenes = buildMeetingScenes(scenario, registerShareholders(scenario), rules);
  if (!scenes.ok) return scenes;
  return ok({ scenes: scenes.value, state: { scenarioId: scenario.id, sceneIndex: 0, records: {}, status: 'in-progress' } });
}

export function currentScene(scenes: readonly MeetingScene[], state: MeetingSimulationState): MeetingScene {
  return scenes[Math.min(state.sceneIndex, scenes.length - 1)] as MeetingScene;
}

/** null — відповідь не того формату; інакше — чи вона правильна. */
function check(question: SceneQuestion, answer: SceneAnswer): boolean | null {
  switch (question.kind) {
    case 'number':
      return typeof answer === 'number' && Number.isFinite(answer) ? answer === question.answer : null;
    case 'yes-no':
      return typeof answer === 'boolean' ? answer === question.answer : null;
    default: {
      if (!Array.isArray(answer)) return null;
      const options = new Set(question.options.map((option) => option.id));
      if (answer.some((id) => !options.has(id)) || new Set(answer).size !== answer.length) return null;
      const given = [...answer].sort();
      return given.length === question.answer.length && given.every((id, index) => id === question.answer[index]);
    }
  }
}

export function answerScene(
  scenes: readonly MeetingScene[],
  state: MeetingSimulationState,
  answer: SceneAnswer,
): Result<MeetingSimulationState, SimulationError> {
  if (state.status === 'finished') return simulationError('finished');
  const scene = currentScene(scenes, state);
  if (!scene.question) return simulationError('no-question');
  if (state.records[scene.id]) return simulationError('already-answered');
  const correct = check(scene.question, answer);
  if (correct === null) return simulationError('wrong-answer-type');
  return ok({ ...state, records: { ...state.records, [scene.id]: { answer, correct } } });
}

export function advanceScene(scenes: readonly MeetingScene[], state: MeetingSimulationState): Result<MeetingSimulationState, SimulationError> {
  if (state.status === 'finished') return simulationError('finished');
  const scene = currentScene(scenes, state);
  if (scene.question && !state.records[scene.id]) return simulationError('answer-required');
  const isLast = state.sceneIndex >= scenes.length - 1;
  return ok(isLast ? { ...state, status: 'finished' } : { ...state, sceneIndex: state.sceneIndex + 1 });
}

/** Результат для ProgressStore / події `trainer-completed`: частка правильних відповідей. */
export function meetingScore(scenes: readonly MeetingScene[], state: MeetingSimulationState): { correct: number; total: number; score: number } {
  const questions = scenes.filter((scene) => scene.question !== null);
  const correct = questions.filter((scene) => state.records[scene.id]?.correct).length;
  return { correct, total: questions.length, score: questions.length === 0 ? 1 : correct / questions.length };
}
