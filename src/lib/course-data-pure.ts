import { XP_RULES } from '../engines/gamification/xp-rules';
import type { Course } from '../content/schemas/course';

/** Середній темп читання навчального тексту українською, слів за хвилину. */
const WORDS_PER_MINUTE = 180;
/** XP за прочитану тему — з правил рушія геймифікації, щоб сторінка теми й нарахування не розходилися. */
export const TOPIC_XP = XP_RULES.topicRead;

export function estimateReadingMinutes(body: string | undefined): number | undefined {
  if (!body) return undefined;
  const words = body.replace(/^---[\s\S]*?---/, '').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** «ПРН 3» з коду реєстру, якщо він є, інакше з ідентифікатора prn03. */
export function outcomeLabel(course: Course, outcomeId: string): string {
  const registered = course.learningOutcomes.find((outcome) => outcome.id === outcomeId);
  if (registered?.code) return registered.code;
  const number = Number.parseInt(outcomeId.replace(/^prn/, ''), 10);
  return Number.isNaN(number) ? outcomeId : `ПРН ${number}`;
}

const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Kyiv' });

/** 2026-09-02 → 02.09.2026 */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T12:00:00+03:00`));
}

export function minutesLabel(minutes: number): string {
  return `${minutes} хв`;
}
