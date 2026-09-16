/** Шапка профілю: великий шестикутник, назва рівня як посада, XP і метр до наступного рівня. */
import { formatXp, levelPositionText, levelProgress } from '../../engines/gamification';
import type { ProgressState } from '../../engines/progress';
import { formatNumber } from '../../engines/shared/number-format';
import { Hex } from './Hex';

interface Props {
  readonly state: ProgressState;
  readonly persistent: boolean;
}

export function ProfileHeader({ state, persistent }: Props) {
  const progress = levelProgress(state.xp);
  const percent = progress.next ? Math.round(progress.ratio * 100) : 100;
  return (
    <header className="prof-head">
      <Hex glyph="level" className="hex hex-big" />
      <div>
        <h1 className="h1" data-profile-level>
          {progress.level.title}
        </h1>
        <div className="lvl">{levelPositionText(progress)}</div>
        <p className="sub">
          {persistent
            ? 'Прогрес зберігається лише в цьому браузері. Імені ми не просимо: у курсі ви — акціонер із правом голосу, а не запис у базі.'
            : 'Сховище браузера недоступне (приватний режим або заборона): прогрес живе лише до закриття вкладки. Збережіть код прогресу нижче, щоб не втратити його.'}
        </p>
      </div>
      <div className="xp-block">
        <div className="big num" data-profile-xp={state.xp}>
          {formatNumber(state.xp, { maximumFractionDigits: 0 })}
          <small>XP</small>
        </div>
        <div
          className="meter meter-xp"
          role="progressbar"
          aria-valuenow={state.xp}
          aria-valuemin={progress.level.minXp}
          aria-valuemax={progress.next?.minXp ?? progress.level.minXp}
          aria-label={progress.next ? `Прогрес до рівня «${progress.next.title}»` : 'Найвищий рівень досягнуто'}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="to">{progress.next ? `Ще ${formatXp(progress.xpRemaining)} до рівня «${progress.next.title}»` : `Ви досягли найвищого рівня — «${progress.level.title}»`}</div>
      </div>
    </header>
  );
}
