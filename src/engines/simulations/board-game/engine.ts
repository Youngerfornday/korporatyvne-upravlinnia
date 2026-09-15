import { err, ok, type Result } from '../../shared/result';
import { METRIC_MAX, METRIC_MIN, METRIC_NAMES, type BoardGame, type DecisionOption, type EndingRating, type GameNode, type MetricName, type Metrics, type Transition } from './types';
import { validateBoardGame, type GraphIssue } from './validate';

export interface GameState {
  readonly gameId: string;
  readonly nodeId: string;
  readonly metrics: Metrics;
  readonly path: readonly { readonly nodeId: string; readonly optionId: string }[];
  readonly status: 'playing' | 'finished';
}

export interface ChoiceResult {
  readonly state: GameState;
  readonly feedback: string;
  /** Фактична зміна метрик (після обмеження 0..100). */
  readonly effects: Metrics;
}

export type BoardGameErrorCode = 'invalid-graph' | 'finished' | 'unknown-option' | 'wrong-game';

export interface BoardGameError {
  readonly code: BoardGameErrorCode;
  readonly message: string;
  readonly issues?: readonly GraphIssue[];
}

/** Оцінка фіналу для ProgressStore і бейджа «Сумлінний директор» (потрібен найкращий фінал). */
export const ENDING_SCORES: Readonly<Record<EndingRating, number>> = { best: 1, good: 0.6, poor: 0.2 };

export const METRIC_LABELS: Readonly<Record<MetricName, string>> = {
  trust: 'Довіра акціонерів',
  value: 'вартість компанії',
  risk: 'ризик',
};

function findNode(game: BoardGame, id: string): GameNode | undefined {
  return game.nodes.find((node) => node.id === id);
}

function clamp(value: number): number {
  return Math.min(METRIC_MAX, Math.max(METRIC_MIN, value));
}

function applyEffects(metrics: Metrics, option: DecisionOption): Metrics {
  return Object.fromEntries(METRIC_NAMES.map((name) => [name, clamp(metrics[name] + (option.effects[name] ?? 0))])) as Metrics;
}

function resolveTransition(next: Transition, metrics: Metrics): string {
  if (typeof next === 'string') return next;
  const branch = next.when.find(({ condition }) => {
    const value = metrics[condition.metric];
    return (condition.atLeast === undefined || value >= condition.atLeast) && (condition.atMost === undefined || value <= condition.atMost);
  });
  return branch?.goto ?? next.otherwise;
}

export function startBoardGame(game: BoardGame): Result<GameState, BoardGameError> {
  const issues = validateBoardGame(game);
  if (issues.length > 0) return err({ code: 'invalid-graph', message: 'Граф кейс-гри містить помилки — гру не можна почати.', issues });
  const start = findNode(game, game.startNodeId);
  return ok({
    gameId: game.id,
    nodeId: game.startNodeId,
    metrics: { ...game.initialMetrics },
    path: [],
    status: start?.kind === 'ending' ? 'finished' : 'playing',
  });
}

export function currentNode(game: BoardGame, state: GameState): GameNode {
  const node = findNode(game, state.nodeId);
  if (!node) throw new RangeError(`Вузла «${state.nodeId}» немає в грі «${game.id}»`);
  return node;
}

export function chooseOption(game: BoardGame, state: GameState, optionId: string): Result<ChoiceResult, BoardGameError> {
  if (state.status === 'finished') return err({ code: 'finished', message: 'Гру завершено — рішення вже не приймаються.' });
  const node = state.gameId === game.id ? findNode(game, state.nodeId) : undefined;
  if (!node) return err({ code: 'wrong-game', message: 'Збережений стан не належить цій грі.' });
  const option = node.kind === 'decision' ? node.options.find((candidate) => candidate.id === optionId) : undefined;
  if (!option) return err({ code: 'unknown-option', message: 'Такого варіанта рішення в цьому вузлі немає.' });

  const metrics = applyEffects(state.metrics, option);
  const nextId = resolveTransition(option.next, metrics);
  const next = findNode(game, nextId);
  const effects = Object.fromEntries(METRIC_NAMES.map((name) => [name, metrics[name] - state.metrics[name]])) as Metrics;
  return ok({
    feedback: option.feedback,
    effects,
    state: {
      ...state,
      nodeId: nextId,
      metrics,
      path: [...state.path, { nodeId: node.id, optionId }],
      status: next?.kind === 'ending' ? 'finished' : 'playing',
    },
  });
}

/** Оцінка 0..1 за фіналом; null — гру ще не завершено. */
export function gameScore(game: BoardGame, state: GameState): number | null {
  const node = findNode(game, state.nodeId);
  return state.status === 'finished' && node?.kind === 'ending' ? ENDING_SCORES[node.rating] : null;
}

/** «Довіра акціонерів — 70 із 100; вартість компанії — 60 із 100; ризик — 25 із 100.» */
export function metricsText(metrics: Metrics): string {
  return `${METRIC_NAMES.map((name) => `${METRIC_LABELS[name]} — ${metrics[name]} із ${METRIC_MAX}`).join('; ')}.`;
}
