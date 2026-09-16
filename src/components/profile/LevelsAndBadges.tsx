/** Сходинки кар’єрних рівнів і сітка бейджів (здобуті — з датою, решта — з умовою й пунктирною рамкою). */
import { BADGES, LEVELS, badgesEarnedText, formatXp, levelForXp } from '../../engines/gamification';
import type { ProgressState } from '../../engines/progress';
import { Hex } from './Hex';

const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Kyiv' });

export function LevelsList({ state }: { readonly state: ProgressState }) {
  const current = levelForXp(state.xp);
  return (
    <section className="block" aria-labelledby="lv-title">
      <h2 className="h2" id="lv-title">
        Кар’єрні рівні
      </h2>
      <p className="note">Кожен рівень відкриває новий інструмент курсу. Бали не згорають і не залежать від щоденних заходів.</p>
      <ol className="levels" data-levels>
        {LEVELS.map((level) => {
          const reached = state.xp >= level.minXp;
          const isNow = level.id === current.id;
          return (
            <li key={level.id} className="level" data-level-id={level.id} data-now={isNow ? '' : undefined} aria-current={isNow ? 'step' : undefined}>
              <Hex glyph="level" off={!reached} />
              <span>
                <b>{level.title}</b>
                <small>{level.unlocks}</small>
              </span>
              <span className="num">{formatXp(level.minXp)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function BadgesGrid({ state }: { readonly state: ProgressState }) {
  const earned = BADGES.filter((badge) => state.badges[badge.id] !== undefined).length;
  return (
    <section className="block" aria-labelledby="bd-title">
      <h2 className="h2" id="bd-title">
        Бейджі
      </h2>
      <p className="note" data-badges-earned>
        {badgesEarnedText(earned, BADGES.length)}. Кожен бейдж — за конкретну дію, а не за кількість входів.
      </p>
      <div className="badges">
        {BADGES.map((badge) => {
          const award = state.badges[badge.id];
          return (
            <article key={badge.id} className={award ? 'card badge' : 'card badge is-off'} data-badge={badge.id} data-earned={award ? 'true' : 'false'}>
              <Hex glyph={badge.id} off={!award} />
              <span>
                <b>{badge.title}</b>
                <small>{award ? badge.achievement : badge.condition}</small>
                {award ? (
                  <span className="when">{dateFormat.format(new Date(award.awardedAt))}</span>
                ) : (
                  <span className="when">не здобуто</span>
                )}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
