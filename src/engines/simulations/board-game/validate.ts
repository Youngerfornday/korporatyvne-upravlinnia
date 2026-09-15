import { METRIC_MAX, METRIC_MIN, METRIC_NAMES, transitionTargets, type BoardGame, type DecisionNode, type GameNode } from './types';

export type GraphIssueCode =
  | 'missing-start'
  | 'duplicate-node'
  | 'duplicate-option'
  | 'invalid-id'
  | 'invalid-metrics'
  | 'unknown-target'
  | 'dead-end'
  | 'unreachable'
  | 'no-ending';

export interface GraphIssue {
  readonly code: GraphIssueCode;
  readonly nodeId: string | null;
  readonly message: string;
}

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function edgesOf(node: GameNode): readonly string[] {
  return node.kind === 'decision' ? node.options.flatMap((option) => transitionTargets(option.next)) : [];
}

function localIssues(node: GameNode, known: ReadonlySet<string>): GraphIssue[] {
  const issues: GraphIssue[] = [];
  if (!SAFE_ID.test(node.id)) issues.push({ code: 'invalid-id', nodeId: node.id, message: `ID вузла «${node.id}» має містити лише латиницю, цифри й дефіси.` });
  if (node.kind !== 'decision') return issues;
  if (node.options.length === 0) issues.push({ code: 'dead-end', nodeId: node.id, message: `Вузол «${node.title}» не має варіантів рішення — гра в ньому застрягне.` });
  const optionIds = node.options.map((option) => option.id);
  if (new Set(optionIds).size !== optionIds.length) issues.push({ code: 'duplicate-option', nodeId: node.id, message: `У вузлі «${node.title}» варіанти мають однакові ID.` });
  for (const option of node.options) {
    if (!SAFE_ID.test(option.id)) issues.push({ code: 'invalid-id', nodeId: node.id, message: `ID варіанта «${option.id}» має містити лише латиницю, цифри й дефіси.` });
    if (Object.values(option.effects).some((delta) => !Number.isFinite(delta))) {
      issues.push({ code: 'invalid-metrics', nodeId: node.id, message: `Наслідки варіанта «${option.label}» мають бути числами.` });
    }
    for (const target of transitionTargets(option.next).filter((candidate) => !known.has(candidate))) {
      issues.push({ code: 'unknown-target', nodeId: node.id, message: `Варіант «${option.label}» веде до неіснуючого вузла «${target}».` });
    }
  }
  return issues;
}

function reachableFrom(start: string, byId: ReadonlyMap<string, GameNode>): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const node = byId.get(id);
    if (seen.has(id) || !node) continue;
    seen.add(id);
    queue.push(...edgesOf(node));
  }
  return seen;
}

/** Вузли, з яких досяжний хоча б один фінал (зворотний обхід від фіналів). */
function canFinish(nodes: readonly GameNode[]): Set<string> {
  const finishing = new Set(nodes.filter((node) => node.kind === 'ending').map((node) => node.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!finishing.has(node.id) && edgesOf(node).some((target) => finishing.has(target))) {
        finishing.add(node.id);
        changed = true;
      }
    }
  }
  return finishing;
}

/**
 * Перевірка графа кейс-гри: старт існує, ID унікальні й безпечні, усі переходи ведуть до існуючих вузлів,
 * немає тупиків (рішення без варіантів), усі вузли досяжні зі старту, з кожного вузла можна дійти до фіналу
 * (без замкнених циклів). Порожній список — граф коректний.
 */
export function validateBoardGame(game: BoardGame): readonly GraphIssue[] {
  const ids = game.nodes.map((node) => node.id);
  const known = new Set(ids);
  const byId = new Map(game.nodes.map((node) => [node.id, node]));
  const issues: GraphIssue[] = [];

  if (!known.has(game.startNodeId)) issues.push({ code: 'missing-start', nodeId: null, message: `Стартового вузла «${game.startNodeId}» немає в грі.` });
  for (const duplicate of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
    issues.push({ code: 'duplicate-node', nodeId: duplicate, message: `ID вузла «${duplicate}» використано кілька разів.` });
  }
  if (METRIC_NAMES.some((name) => !(game.initialMetrics[name] >= METRIC_MIN && game.initialMetrics[name] <= METRIC_MAX))) {
    issues.push({ code: 'invalid-metrics', nodeId: null, message: `Початкові метрики мають бути від ${METRIC_MIN} до ${METRIC_MAX}.` });
  }
  const uniqueNodes = [...byId.values()];
  issues.push(...uniqueNodes.flatMap((node) => localIssues(node, known)));

  const reachable = known.has(game.startNodeId) ? reachableFrom(game.startNodeId, byId) : new Set<string>();
  const finishing = canFinish(uniqueNodes);
  for (const node of uniqueNodes) {
    if (known.has(game.startNodeId) && !reachable.has(node.id)) {
      issues.push({ code: 'unreachable', nodeId: node.id, message: `Вузол «${node.title}» недосяжний зі старту.` });
    }
    if (node.kind === 'decision' && (node as DecisionNode).options.length > 0 && !finishing.has(node.id)) {
      issues.push({ code: 'no-ending', nodeId: node.id, message: `З вузла «${node.title}» неможливо дійти до жодного фіналу.` });
    }
  }
  return issues;
}
