export { advanceScene, answerScene, createMeetingSimulation, currentScene, meetingScore } from './machine';
export type { MeetingSimulation, MeetingSimulationState, SceneRecord, SimulationError, SimulationErrorCode } from './machine';
export { registerShareholders, validateScenario } from './registration';
export { buildMeetingScenes } from './scenes';
export type { MeetingScene, SceneAnswer, SceneKind, SceneQuestion, ScenarioError } from './scenes';
export type * from './types';
export { electBoard, tallyResolution } from './voting';
export type { CandidateTally, ElectionResult, ResolutionTally } from './voting';
