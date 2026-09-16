/** Бокс XP у боковій панелі тесту: рівень, метр до наступного рівня, потенціал тесту. */
import { XP_RULES, formatXp, levelProgress, nextLevelText } from '../../engines/gamification';
import type { ProgressState } from '../../engines/progress';
import { formatPercent } from '../../engines/shared/number-format';
import { quizIdForTopic } from '../progress/derive';

interface Props {
  readonly state: ProgressState;
  readonly topicId: string;
  readonly persistent: boolean;
}

export function XpBox({ state, topicId, persistent }: Props) {
  const progress = levelProgress(state.xp);
  const quiz = state.quizzes[quizIdForTopic(topicId)];
  const percent = progress.next ? Math.round(progress.ratio * 100) : 100;
  return (
    <div className="xp-box">
      <div className="big num">{formatXp(state.xp)}</div>
      <div
        className="meter meter-xp"
        role="progressbar"
        aria-valuenow={state.xp}
        aria-valuemin={progress.level.minXp}
        aria-valuemax={progress.next?.minXp ?? progress.level.minXp}
        aria-label={progress.next ? `До рівня «${progress.next.title}»` : 'Найвищий рівень'}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="faint">{nextLevelText(progress)}</div>
      <div className="faint">
        {quiz ? `Найкращий результат: ${formatPercent(quiz.bestScore, 0)}. ` : ''}
        За тест — до {formatXp(XP_RULES.quizMax)}; повтор дає лише приріст.
      </div>
      {!persistent && <div className="faint">Сховище браузера недоступне: XP збережуться лише до закриття вкладки.</div>}
    </div>
  );
}
