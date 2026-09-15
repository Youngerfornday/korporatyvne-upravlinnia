/**
 * Кар'єрні рівні гравця для статичних заготовок (чип у шапці, сходинки на головній).
 * ponytail: пороги XP — робоча версія з DESIGN.md; остаточні правила задає рушій геймифікації (src/engines),
 * який гідрує елементи з data-level-id за цими ж ідентифікаторами.
 */
export interface PlayerLevel {
  readonly id: string;
  readonly title: string;
  readonly minXp: number;
}

export const PLAYER_LEVELS: readonly PlayerLevel[] = [
  { id: 'shareholder', title: 'Акціонер', minXp: 0 },
  { id: 'minority', title: 'Міноритарій', minXp: 500 },
  { id: 'board-member', title: 'Член наглядової ради', minXp: 1200 },
  { id: 'independent-director', title: 'Незалежний директор', minXp: 2200 },
  { id: 'chair', title: 'Голова ради', minXp: 3400 },
];

export const INITIAL_LEVEL = PLAYER_LEVELS[0] as PlayerLevel;

const xpFormat = new Intl.NumberFormat('uk-UA');

export function formatXp(xp: number): string {
  return `${xpFormat.format(xp)} XP`;
}
