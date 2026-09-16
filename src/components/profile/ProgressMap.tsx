/** Карта проходження: реєстр тем × дій зі знаками стану й нарахованими XP. */
import type { ProgressState } from '../../engines/progress';
import { xpLedgerKey } from '../../engines/progress';
import { formatPercent } from '../../engines/shared/number-format';
import { quizIdForTopic, topicVisualState, type TopicVisualState } from '../progress/derive';
import { Icon } from '../quiz/Icon';

export interface MapTopic {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly slug: string;
}

export interface MapModule {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly topics: readonly MapTopic[];
}

interface Props {
  readonly modules: readonly MapModule[];
  readonly state: ProgressState;
  readonly topicUrl: (slug: string) => string;
}

const MARK_LABEL: Readonly<Record<TopicVisualState, string>> = { done: 'виконано', doing: 'у процесі', todo: 'не виконано' };
const FLAWLESS = 0.999999;

function Mark({ state, note }: { readonly state: TopicVisualState; readonly note?: string }) {
  return (
    <>
      <span className={`mark mark-${state}`} role="img" aria-label={MARK_LABEL[state]}>
        {state === 'done' && <Icon name="check" />}
        {state === 'doing' && <Icon name="play" />}
      </span>
      {note && <span className="num">{note}</span>}
    </>
  );
}

export function ProgressMap({ modules, state, topicUrl }: Props) {
  return (
    <section className="block block-map" aria-labelledby="map-title">
      <h2 className="h2" id="map-title">
        Карта проходження
      </h2>
      <p className="note">Що зроблено в кожній темі. Знак означає завершену дію; поруч — нараховані XP або найкращий результат.</p>
      <div className="map-wrap">
        <div className="map" role="table" aria-label="Карта проходження за темами">
          <div className="map-row" role="row">
            <div className="head" role="columnheader">Тема</div>
            <div className="head" role="columnheader">Лекція</div>
            <div className="head" role="columnheader">Самоперевірка</div>
            <div className="head" role="columnheader">Тест</div>
            <div className="head" role="columnheader">Практикум</div>
          </div>
          {modules.map((module) => (
            <div key={module.id} className="map-module" role="rowgroup">
              <div className="map-row" role="row">
                <div className="mod" role="cell">
                  Модуль {module.number}. {module.title}
                </div>
              </div>
              {module.topics.map((topic) => {
                const visual = topicVisualState(state, topic.id);
                const readXp = state.xpLedger[xpLedgerKey('topic-read', topic.id)];
                const checkXp = state.xpLedger[xpLedgerKey('self-check', topic.id)];
                const quiz = state.quizzes[quizIdForTopic(topic.id)];
                const quizState: TopicVisualState = quiz ? (quiz.bestScore > FLAWLESS ? 'done' : 'doing') : 'todo';
                return (
                  <div key={topic.id} className="map-row" role="row" data-map-topic={topic.id}>
                    <div className="t" role="rowheader">
                      <span className="n">{topic.number}.</span>
                      <a href={topicUrl(topic.slug)}>{topic.title}</a>
                    </div>
                    <div className="c" role="cell">
                      <Mark state={visual} note={readXp !== undefined ? String(readXp) : undefined} />
                    </div>
                    <div className="c" role="cell">
                      <Mark state={checkXp !== undefined ? 'done' : 'todo'} note={checkXp !== undefined ? String(checkXp) : undefined} />
                    </div>
                    <div className="c" role="cell">
                      <Mark state={quizState} note={quiz ? formatPercent(quiz.bestScore, 0) : undefined} />
                    </div>
                    <div className="c faint" role="cell">
                      <span aria-label="тренажер ще не опубліковано">—</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
