/** Рядок «Показано 8 із 44 матеріалів · Модуль 2 · Лекція, Тест» і поточне сортування. */
import type { MaterialFilters, SortState } from './filter';
import { BLOOM_TEXT, TYPE_LABELS, pluralUk } from './texts';
import type { ModuleOption } from './types';

/** Після «із»: «із 1 матеріалу», «із 44 матеріалів». */
const MATERIAL_GENITIVE = { one: 'матеріалу', few: 'матеріалів', many: 'матеріалів', other: 'матеріалу' } as const;

const SORT_TEXT: Readonly<Record<SortState['key'], string>> = {
  order: 'за порядком курсу',
  title: 'за назвою',
  type: 'за типом',
  topic: 'за темою',
  size: 'за розміром',
  updated: 'за датою оновлення',
};

export interface ResultsLineProps {
  readonly shown: number;
  readonly total: number;
  readonly filters: MaterialFilters;
  readonly modules: readonly ModuleOption[];
  readonly sort: SortState;
  readonly onReset: () => void;
}

export function ResultsLine({ shown, total, filters, modules, sort, onReset }: ResultsLineProps) {
  const module = modules.find((m) => m.id === filters.moduleId);
  const parts = [
    module && `Модуль ${module.number}`,
    filters.types.length > 0 && filters.types.map((type) => TYPE_LABELS[type]).join(', '),
    filters.bloom !== '' && `Блум: ${BLOOM_TEXT[filters.bloom].label.toLocaleLowerCase('uk-UA')}`,
    filters.query.trim() !== '' && `пошук «${filters.query.trim()}»`,
  ].filter(Boolean);
  const direction = sort.key === 'order' ? '' : sort.direction === 'ascending' ? ', за зростанням' : ', за спаданням';
  const filtered = parts.length > 0;
  return (
    <div className="results-line">
      <span>
        <span role="status" data-results-count={shown}>
          Показано <b>{shown}</b> із {pluralUk(total, MATERIAL_GENITIVE)}
          {filtered && ` · ${parts.join(' · ')}`}
        </span>
        {filtered && (
          <>
            {' '}
            <button className="link-btn" type="button" onClick={onReset}>
              Скинути фільтри
            </button>
          </>
        )}
      </span>
      <span>
        Сортування: {SORT_TEXT[sort.key]}
        {direction}
      </span>
    </div>
  );
}
