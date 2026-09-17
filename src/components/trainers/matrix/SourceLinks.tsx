/** Джерела клітинки матриці чи завдання: назва-посилання і дата перевірки. */
import { formatDate } from '../../../lib/course-data-pure';

export interface MatrixSourceRef {
  readonly title: string;
  readonly url: string;
  readonly checkedAt: string;
}

export type MatrixSources = Readonly<Record<string, MatrixSourceRef>>;

export function SourceLinks({ ids, sources }: { readonly ids: readonly string[]; readonly sources: MatrixSources }) {
  const known = ids.filter((id) => Object.hasOwn(sources, id));
  if (known.length === 0) return null;
  return (
    <p className="msrc">
      <span className="faint">{known.length > 1 ? 'Джерела: ' : 'Джерело: '}</span>
      {known.map((id, index) => {
        const source = sources[id];
        if (!source) return null;
        return (
          <span key={id}>
            {index > 0 && '; '}
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
            </a>
            <span className="verified"> · перевірено {formatDate(source.checkedAt)}</span>
          </span>
        );
      })}
    </p>
  );
}
