/** Геймифікація сайту: XP за подіями, кар’єрні рівні, бейджі. Стан — ProgressState (progress/state.ts). */
export { applyLearningEvent, type EventOutcome, type GamificationError, type GamificationErrorCode } from './apply-event';
export { BADGES, BADGE_ACTIVITY_IDS, earnedBadgeIds, findBadge, type BadgeDefinition } from './badges';
export { LEVELS, levelForXp, levelProgress, type Level, type LevelProgress } from './levels';
export { badgesEarnedText, eventOutcomeText, formatXp, levelPositionText, newBadgesText, nextLevelText, xpGainText } from './texts';
export { XP_RULES, awardForEvent, validateLearningEvent, type LearningEvent, type XpAward } from './xp-rules';
