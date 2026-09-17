/** Матриця ПРН × теми: позначки покриття — форма й літера, а не лише колір; скрол у власному контейнері. */
import { Icon } from '../quiz/Icon';
import { coveredTopics, outcomesPerTopic, viewMatrix } from './matrix';
import type { Coverage, OutcomeMatrix } from './types';

const COVERAGE_TEXT: Readonly<Record<Coverage, string>> = {
  both: 'лекція і практична',
  lecture: 'лише лекція',
  practical: 'лише практична',
  none: 'не покрито',
};

/** У клітинці позначка — зображення з підписом; у легенді — декоративна (підпис стоїть поруч текстом). */
export function CoverageMark({ coverage, decorative = false }: { readonly coverage: Coverage; readonly decorative?: boolean }) {
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': COVERAGE_TEXT[coverage] };
  return (
    <span className={`cov cov-${coverage}`} {...a11y} data-coverage={coverage}>
      {coverage === 'both' && <Icon name="check" />}
      {coverage === 'lecture' && <span aria-hidden="true">Л</span>}
      {coverage === 'practical' && <span aria-hidden="true">П</span>}
    </span>
  );
}

export interface OutcomeMatrixViewProps {
  readonly matrix: OutcomeMatrix;
  readonly moduleId: string;
  readonly query: string;
}

export function OutcomeMatrixView({ matrix, moduleId, query }: OutcomeMatrixViewProps) {
  const view = viewMatrix(matrix, moduleId, query);
  const topics = view.topicIndexes.map((index) => ({ index, topic: matrix.topics[index] }));
  return (
    <>
      {view.rows.length === 0 ? (
        <p className="empty" role="status">
          Жоден ПРН не відповідає пошуку. Змініть запит або модуль.
        </p>
      ) : (
        <div className="matrix-wrap" role="region" aria-labelledby="matrix-caption" tabIndex={0}>
          <table className="matrix" data-matrix>
            <caption id="matrix-caption" className="visually-hidden">
              Матриця покриття програмних результатів навчання темами курсу
            </caption>
            <thead>
              <tr>
                <th scope="col">Програмний результат навчання</th>
                {topics.map(({ index, topic }) => (
                  <th key={index} scope="col" data-published={topic?.published ? 'true' : 'false'}>
                    <span aria-hidden="true" title={topic ? `Тема ${topic.number}. ${topic.title}` : undefined}>
                      Т{topic?.number}
                    </span>
                    <span className="visually-hidden">Тема {topic?.number}. {topic?.title}</span>
                  </th>
                ))}
                <th scope="col" className="num">
                  Тем
                </th>
                <th scope="col" className="prac">
                  Практичні
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => {
                const practicals = row.practicals.filter((p) => moduleId === '' || p.moduleId === moduleId);
                return (
                  <tr key={row.id} data-outcome={row.id}>
                    <th scope="row">
                      <b>{row.code}</b>
                      <span className="mat-sub">{row.statement}</span>
                    </th>
                    {topics.map(({ index }) => (
                      <td key={index}>
                        <CoverageMark coverage={row.cells[index] ?? 'none'} />
                      </td>
                    ))}
                    <td className="total num">{coveredTopics(row, view.topicIndexes)}</td>
                    <td className="prac">{practicals.length > 0 ? practicals.map((p) => `П${p.number}`).join(', ') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">ПРН на тему</th>
                {topics.map(({ index }) => (
                  <td key={index} className="num">
                    {outcomesPerTopic(view.rows, index)}
                  </td>
                ))}
                <td className="num">—</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="matrix-legend">
        {(['both', 'lecture', 'practical', 'none'] as const).map((coverage) => (
          <span key={coverage}>
            <CoverageMark coverage={coverage} decorative />
            {COVERAGE_TEXT[coverage]}
          </span>
        ))}
        <span className="faint" data-matrix-count>
          Показано {view.rows.length} із {matrix.rows.length} ПРН
          {moduleId !== '' && ' · фільтр за модулем'}
        </span>
      </div>
    </>
  );
}
