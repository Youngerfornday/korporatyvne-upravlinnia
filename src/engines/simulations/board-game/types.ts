/** Кейс-гра «Рішення ради»: граф рішень із наслідками для метрик і фіналами. */
export type MetricName = 'trust' | 'value' | 'risk';

export type Metrics = Readonly<Record<MetricName, number>>;

export interface MetricCondition {
  readonly metric: MetricName;
  readonly atLeast?: number;
  readonly atMost?: number;
}

/** Перехід залежно від метрик після застосування наслідків: перша умова, що справджується, або `otherwise`. */
export interface ConditionalTransition {
  readonly when: readonly { readonly condition: MetricCondition; readonly goto: string }[];
  readonly otherwise: string;
}

export type Transition = string | ConditionalTransition;

export interface DecisionOption {
  readonly id: string;
  readonly label: string;
  readonly feedback: string;
  readonly effects: Partial<Record<MetricName, number>>;
  readonly next: Transition;
}

export interface DecisionNode {
  readonly id: string;
  readonly kind: 'decision';
  readonly title: string;
  readonly text: string;
  readonly options: readonly DecisionOption[];
}

export type EndingRating = 'best' | 'good' | 'poor';

export interface EndingNode {
  readonly id: string;
  readonly kind: 'ending';
  readonly title: string;
  readonly text: string;
  readonly rating: EndingRating;
}

export type GameNode = DecisionNode | EndingNode;

export interface BoardGame {
  readonly id: string;
  readonly title: string;
  readonly startNodeId: string;
  readonly initialMetrics: Metrics;
  readonly nodes: readonly GameNode[];
}

export const METRIC_NAMES: readonly MetricName[] = ['trust', 'value', 'risk'];
export const METRIC_MIN = 0;
export const METRIC_MAX = 100;

export function transitionTargets(next: Transition): readonly string[] {
  return typeof next === 'string' ? [next] : [...next.when.map((branch) => branch.goto), next.otherwise];
}
