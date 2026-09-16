import { describe, expect, test } from 'vitest';
import { LEVELS } from '../../engines/gamification';
import { escapeHtml, outcomeToastHtml } from './toast-text';

const shareholder = LEVELS[0]!;
const minority = LEVELS[1]!;

describe('outcomeToastHtml', () => {
  test('дублікат і нульовий приріст — тосту немає', () => {
    expect(outcomeToastHtml({ duplicate: true, xpGained: 50, leveledUp: false, levelAfter: shareholder, newBadges: [] })).toBeNull();
    expect(outcomeToastHtml({ duplicate: false, xpGained: 0, leveledUp: false, levelAfter: shareholder, newBadges: [] })).toBeNull();
  });

  test('XP латунним, рівень і бейдж через роздільник', () => {
    const html = outcomeToastHtml({ duplicate: false, xpGained: 150, leveledUp: true, levelAfter: minority, newBadges: ['uvazhnyi-chytach'] });
    expect(html).toContain('<span class="xp">+150 XP</span>');
    expect(html).toContain('Новий рівень: «Міноритарій»');
    expect(html).toContain('Бейдж: «Уважний читач»');
    expect(html?.split(' · ')).toHaveLength(3);
  });

  test('невідомий ID бейджа показується як є, але екранується', () => {
    const html = outcomeToastHtml({ duplicate: false, xpGained: 0, leveledUp: false, levelAfter: shareholder, newBadges: ['<b>'] });
    expect(html).toBe('Бейдж: «&lt;b&gt;»');
  });
});

test('escapeHtml екранує п’ять спецсимволів', () => {
  expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
