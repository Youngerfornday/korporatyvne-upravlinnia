/** React-острів профілю гравця: серверний рендер зі станом «0», після гідрації — стан зі сховища. */
import { useProgress } from '../progress/use-progress';
import { BadgesGrid, LevelsList } from './LevelsAndBadges';
import { ProfileHeader } from './ProfileHeader';
import { ProgressCode } from './ProgressCode';
import { ProgressMap, type MapModule } from './ProgressMap';

export interface ProfileIslandProps {
  readonly modules: readonly MapModule[];
  /** Базовий шлях тем із base (url('temy/')), щоб острів не залежав від import.meta.env. */
  readonly topicsBase: string;
}

export function ProfileIsland({ modules, topicsBase }: ProfileIslandProps) {
  const { state, persistent, client } = useProgress();
  return (
    <div data-profile data-hydrated={client ? 'true' : 'false'}>
      <ProfileHeader state={state} persistent={persistent} />
      <div className="grid2">
        <LevelsList state={state} />
        <BadgesGrid state={state} />
      </div>
      <ProgressMap modules={modules} state={state} topicUrl={(slug) => `${topicsBase}${slug}/`} />
      <ProgressCode state={state} client={client} />
    </div>
  );
}
