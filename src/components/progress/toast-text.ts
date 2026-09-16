/** Текст тосту за результатом навчальної події (чиста функція, без DOM). */
import { findBadge, xpGainText, type EventOutcome } from '../../engines/gamification';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Тост: XP латунним, далі новий рівень і бейджі; дублікати й нульовий приріст мовчать (null). */
export function outcomeToastHtml(outcome: Pick<EventOutcome, 'duplicate' | 'xpGained' | 'leveledUp' | 'levelAfter' | 'newBadges'>): string | null {
  if (outcome.duplicate || (outcome.xpGained === 0 && !outcome.leveledUp && outcome.newBadges.length === 0)) return null;
  const parts: string[] = [];
  if (outcome.xpGained > 0) parts.push(`<span class="xp">${escapeHtml(xpGainText(outcome.xpGained))}</span>`);
  if (outcome.leveledUp) parts.push(escapeHtml(`Новий рівень: «${outcome.levelAfter.title}»`));
  if (outcome.newBadges.length > 0) {
    parts.push(escapeHtml(`Бейдж: ${outcome.newBadges.map((id) => `«${findBadge(id)?.title ?? id}»`).join(', ')}`));
  }
  return parts.join(' · ');
}
