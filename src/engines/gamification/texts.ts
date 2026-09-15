import { pluralUk } from '../../lib/plural';
import { formatNumber } from '../shared/number-format';
import type { EventOutcome } from './apply-event';
import { findBadge } from './badges';
import type { LevelProgress } from './levels';

const NBSP = '\u00A0';
const NEW_BADGE_FORMS = { one: 'новий бейдж', few: 'нові бейджі', many: 'нових бейджів', other: 'нового бейджа' } as const;

/** «1 200 XP». */
export function formatXp(xp: number): string {
  return `${formatNumber(xp, { maximumFractionDigits: 0 })}${NBSP}XP`;
}

/** «+130 XP» — для тосту. */
export function xpGainText(xp: number): string {
  return `+${formatXp(xp)}`;
}

/** «Ще 560 XP до рівня «Член наглядової ради»». */
export function nextLevelText(progress: LevelProgress): string {
  if (!progress.next) return `Ви досягли найвищого рівня — «${progress.level.title}»`;
  return `Ще ${formatXp(progress.xpRemaining)} до рівня «${progress.next.title}»`;
}

/** «Ваш рівень — 2 із 5». */
export function levelPositionText(progress: LevelProgress): string {
  return `Ваш рівень — ${progress.position} із ${progress.total}`;
}

/** «Здобуто 3 із 9». */
export function badgesEarnedText(earned: number, total: number): string {
  return `Здобуто ${earned} із ${total}`;
}

/** «Отримано 2 нові бейджі». */
export function newBadgesText(count: number): string {
  return `Отримано ${pluralUk(count, NEW_BADGE_FORMS)}`;
}

/** Підсумок події для `role="status"`: XP, новий рівень, нові бейджі. */
export function eventOutcomeText(outcome: Pick<EventOutcome, 'xpGained' | 'duplicate' | 'leveledUp' | 'levelAfter' | 'newBadges'>): string {
  if (outcome.duplicate) return 'Цей результат уже враховано.';
  const parts: string[] = [];
  if (outcome.xpGained > 0) parts.push(xpGainText(outcome.xpGained));
  if (outcome.leveledUp) parts.push(`Новий рівень: «${outcome.levelAfter.title}»`);
  if (outcome.newBadges.length > 0) {
    const titles = outcome.newBadges.map((id) => `«${findBadge(id)?.title ?? id}»`).join(', ');
    parts.push(`${newBadgesText(outcome.newBadges.length)}: ${titles}`);
  }
  if (parts.length === 0) return 'Результат не перевищує попередній найкращий — нових XP немає.';
  return `${parts.join('. ')}.`;
}
