import { describe, expect, it } from 'vitest';
import { boardGame } from './__fixtures__/board-game';
import { chooseOption, currentNode, gameScore, metricsText, startBoardGame, type GameState } from './engine';
import { MAX_SERIALIZED_GAME_LENGTH, restoreGameState, serializeGameState } from './serialize';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function play(choices: readonly string[], game = boardGame()): GameState {
  return choices.reduce((state, optionId) => unwrap(chooseOption(game, state, optionId)).state, unwrap(startBoardGame(game)));
}

describe('board game engine', () => {
  it('starts at the start node with the initial metrics', () => {
    const state = unwrap(startBoardGame(boardGame()));
    expect(state).toEqual({ gameId: 'board-decision-game', nodeId: 'related-party', metrics: { trust: 50, value: 50, risk: 40 }, path: [], status: 'playing' });
    expect(currentNode(boardGame(), state).title).toBe('Правочин із заінтересованістю');
    expect(gameScore(boardGame(), state)).toBeNull();
  });

  it('applies effects, returns feedback and never mutates the previous state', () => {
    // Arrange
    const game = boardGame();
    const start = unwrap(startBoardGame(game));

    // Act
    const result = unwrap(chooseOption(game, start, 'approve-now'));

    // Assert
    expect(result.feedback).toContain('довіра');
    expect(result.effects).toEqual({ trust: -20, value: 5, risk: 25 });
    expect(result.state).toMatchObject({ nodeId: 'audit-finding', metrics: { trust: 30, value: 55, risk: 65 }, path: [{ nodeId: 'related-party', optionId: 'approve-now' }] });
    expect(start.metrics).toEqual({ trust: 50, value: 50, risk: 40 });
  });

  it.each([
    [['independent-review', 'balanced'], 'ending-best', 1],
    [['approve-now', 'disclose', 'balanced'], 'ending-good', 0.6],
    [['approve-now', 'hide'], 'ending-scandal', 0.2],
    [['reject', 'comply'], 'ending-poor', 0.2],
  ])('path %o ends at %s with score %d', (choices, endingId, score) => {
    const state = play(choices);
    expect(state.status).toBe('finished');
    expect(state.nodeId).toBe(endingId);
    expect(gameScore(boardGame(), state)).toBe(score);
  });

  it('clamps metrics to 0..100 and reports the effective change', () => {
    const game = { ...boardGame(), initialMetrics: { trust: 10, value: 98, risk: 90 } };
    const result = unwrap(chooseOption(game, unwrap(startBoardGame(game)), 'approve-now'));
    expect(result.state.metrics).toEqual({ trust: 0, value: 100, risk: 100 });
    expect(result.effects).toEqual({ trust: -10, value: 2, risk: 10 });
  });

  it('returns typed errors for finished games, unknown options, foreign states and invalid graphs', () => {
    const game = boardGame();
    const finished = play(['reject', 'comply']);
    expect(chooseOption(game, finished, 'balanced')).toMatchObject({ ok: false, error: { code: 'finished' } });
    expect(chooseOption(game, unwrap(startBoardGame(game)), 'hide')).toMatchObject({ ok: false, error: { code: 'unknown-option' } });
    expect(chooseOption(game, { ...finished, gameId: 'other', status: 'playing' }, 'x')).toMatchObject({ ok: false, error: { code: 'wrong-game' } });
    expect(chooseOption(game, { ...finished, nodeId: 'ghost', status: 'playing' }, 'x')).toMatchObject({ ok: false, error: { code: 'wrong-game' } });
    const broken = { ...game, startNodeId: 'ghost' };
    expect(startBoardGame(broken)).toMatchObject({ ok: false, error: { code: 'invalid-graph', issues: [expect.objectContaining({ code: 'missing-start' })] } });
  });

  it('describes metrics for screen readers', () => {
    expect(metricsText({ trust: 70, value: 60, risk: 25 })).toBe('Довіра акціонерів — 70 із 100; вартість компанії — 60 із 100; ризик — 25 із 100.');
  });
});

describe('board game serialization', () => {
  it('round-trips by replaying the recorded choices', () => {
    const state = play(['approve-now', 'disclose']);
    expect(restoreGameState(boardGame(), serializeGameState(state))).toEqual({ ok: true, value: state });
  });

  it('recomputes metrics instead of trusting stored numbers', () => {
    const raw = JSON.stringify({ v: 1, gameId: 'board-decision-game', choices: ['independent-review'], metrics: { trust: 100 } });
    const restored = restoreGameState(boardGame(), raw);
    expect(restored.ok && restored.value.metrics).toEqual({ trust: 60, value: 50, risk: 30 });
  });

  it.each([
    ['{broken', 'invalid-json'],
    ['{"v":2,"gameId":"board-decision-game","choices":[]}', 'invalid-format'],
    ['{"v":1,"gameId":"board-decision-game","choices":["<script>"]}', 'invalid-format'],
    ['{"v":1,"gameId":"other-game","choices":[]}', 'wrong-game'],
    ['{"v":1,"gameId":"board-decision-game","choices":["hide"]}', 'invalid-path'],
    ['{"v":1,"gameId":"board-decision-game","choices":["reject","comply","balanced"]}', 'invalid-path'],
  ])('rejects %s as %s', (raw, code) => {
    expect(restoreGameState(boardGame(), raw)).toMatchObject({ ok: false, error: { code } });
  });

  it('rejects oversized input before parsing and invalid graphs', () => {
    expect(restoreGameState(boardGame(), ' '.repeat(MAX_SERIALIZED_GAME_LENGTH + 1))).toMatchObject({ ok: false, error: { code: 'too-large' } });
    expect(restoreGameState({ ...boardGame(), startNodeId: 'ghost' }, serializeGameState(play([])))).toMatchObject({ ok: false, error: { code: 'invalid-graph' } });
  });
});
