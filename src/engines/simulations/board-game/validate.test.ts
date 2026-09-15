import { describe, expect, it } from 'vitest';
import { boardGame } from './__fixtures__/board-game';
import type { BoardGame, DecisionNode, GameNode } from './types';
import { validateBoardGame } from './validate';

function withNodes(nodes: readonly GameNode[], patch: Partial<BoardGame> = {}): BoardGame {
  return { ...boardGame(), nodes, ...patch };
}

function decision(id: string, next: DecisionNode['options'][number]['next'], optionId = 'go'): DecisionNode {
  return { id, kind: 'decision', title: id, text: id, options: [{ id: optionId, label: optionId, feedback: 'ok', effects: {}, next }] };
}

const ending: GameNode = { id: 'end', kind: 'ending', title: 'Кінець', text: 'Кінець', rating: 'good' };

const codes = (game: BoardGame) => validateBoardGame(game).map((issue) => issue.code);

describe('validateBoardGame', () => {
  it('accepts a connected graph where every path reaches an ending', () => {
    expect(validateBoardGame(boardGame())).toEqual([]);
  });

  it('reports a missing start node and duplicate node IDs', () => {
    expect(codes(withNodes([decision('a', 'end'), ending], { startNodeId: 'ghost' }))).toContain('missing-start');
    expect(codes(withNodes([decision('start', 'end'), ending, ending], { startNodeId: 'start' }))).toContain('duplicate-node');
  });

  it('reports links to unknown nodes', () => {
    const issues = validateBoardGame(withNodes([decision('start', 'nowhere'), ending], { startNodeId: 'start' }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'unknown-target', nodeId: 'start', message: expect.stringContaining('nowhere') }));
  });

  it('checks conditional targets as well', () => {
    const next = { when: [{ condition: { metric: 'risk' as const, atLeast: 50 }, goto: 'ghost' }], otherwise: 'end' };
    expect(codes(withNodes([decision('start', next), ending], { startNodeId: 'start' }))).toEqual(['unknown-target']);
  });

  it('reports unreachable nodes', () => {
    expect(codes(withNodes([decision('start', 'end'), ending, decision('island', 'end')], { startNodeId: 'start' }))).toEqual(['unreachable']);
  });

  it('reports dead ends: decisions without options', () => {
    const empty: DecisionNode = { id: 'start', kind: 'decision', title: 'Порожньо', text: '', options: [] };
    expect(codes(withNodes([empty, ending], { startNodeId: 'start' }))).toContain('dead-end');
  });

  it('reports loops from which no ending can be reached', () => {
    const issues = validateBoardGame(withNodes([decision('start', 'loop'), decision('loop', 'start'), ending], { startNodeId: 'start' }));
    expect(issues.filter((issue) => issue.code === 'no-ending').map((issue) => issue.nodeId)).toEqual(['start', 'loop']);
  });

  it('reports duplicate option IDs, unsafe IDs and metrics outside 0..100', () => {
    const twice: DecisionNode = { ...decision('start', 'end'), options: [...decision('start', 'end').options, ...decision('start', 'end').options] };
    expect(codes(withNodes([twice, ending], { startNodeId: 'start' }))).toContain('duplicate-option');
    expect(codes(withNodes([decision('start', 'end', 'Bad option'), ending], { startNodeId: 'start' }))).toContain('invalid-id');
    expect(codes(withNodes([decision('start', 'end'), ending], { startNodeId: 'start', initialMetrics: { trust: 120, value: 50, risk: 0 } }))).toContain('invalid-metrics');
  });

  it('writes every issue message in Ukrainian', () => {
    const issues = validateBoardGame(withNodes([decision('start', 'nowhere'), decision('island', 'island')], { startNodeId: 'start' }));
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue.message).toMatch(/[а-яіїєґ]/i);
  });
});
