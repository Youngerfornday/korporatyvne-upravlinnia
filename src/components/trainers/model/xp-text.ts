/** Тексти про XP тренажерів-калькуляторів: XP — лише за новий розв’язаний варіант, до 60 за тренажер. */
import { XP_RULES, eventOutcomeText, formatXp, newBadgesText, findBadge, type EventOutcome } from '../../../engines/gamification';
import { xpLedgerKey, type ProgressState } from '../../../engines/progress';
import { pluralUk } from '../../../lib/plural';

type Outcome = Pick<EventOutcome, 'duplicate' | 'xpGained' | 'leveledUp' | 'levelAfter' | 'newBadges'>;

export const WRONG_ANSWER_TEXT = 'Відповідь неповна або хибна — XP не нараховано. Розберіть розв’язок і візьміть новий варіант.';
export const ALREADY_SOLVED_TEXT = 'Цей варіант уже розв’язано раніше — XP за нього не нараховуються.';

export function solvedOutcomeText(outcome: Outcome): string {
  if (outcome.duplicate) return ALREADY_SOLVED_TEXT;
  if (outcome.xpGained > 0) return eventOutcomeText(outcome);
  const badges = outcome.newBadges.map((id) => `«${findBadge(id)?.title ?? id}»`).join(', ');
  const base = `Варіант зараховано. XP за цей тренажер уже нараховано повністю — ${formatXp(XP_RULES.trainerMax)}.`;
  return badges ? `${base} ${newBadgesText(outcome.newBadges.length)}: ${badges}.` : base;
}

const VARIANT_FORMS = { one: 'варіант', few: 'варіанти', many: 'варіантів', other: 'варіанта' } as const;

/** «Розв’язано 2 варіанти · 60 XP з 60». */
export function trainerStatusText(state: ProgressState, activityId: string): string {
  const solved = state.activities[activityId]?.solvedVariants?.length ?? 0;
  const xp = state.xpLedger[xpLedgerKey('trainer', activityId)] ?? 0;
  return `Розв’язано ${pluralUk(solved, VARIANT_FORMS)} · ${formatXp(xp)} з ${formatXp(XP_RULES.trainerMax)}`;
}

export function isVariantSolved(state: ProgressState, activityId: string, variantId: string): boolean {
  return state.activities[activityId]?.solvedVariants?.includes(variantId) ?? false;
}
