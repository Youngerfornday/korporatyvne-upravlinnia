/** Таблиця матеріалів: заголовки-кнопки з aria-sort, чекбокси лише в режимі вивантаження. */
import { useEffect, useRef } from 'react';
import { Icon } from '../quiz/Icon';
import type { SortKey, SortState } from './filter';
import { BankLink, BloomMini, FormatBoxes, MaterialTitle, PendingChip, SelectBox, TypeLabel, outcomeNumbers, placeLabel, sizeLabel } from './MaterialBits';
import { isSelectable } from './selection';
import type { Audience, Material } from './types';

export interface MaterialsTableProps {
  readonly materials: readonly Material[];
  readonly audience: Audience;
  readonly exportMode: boolean;
  readonly selected: readonly string[];
  readonly sort: SortState;
  readonly onSort: (key: SortKey) => void;
  readonly onToggle: (id: string) => void;
  readonly onToggleAll: (ids: readonly string[], select: boolean) => void;
}

interface SortHeaderProps {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly sort: SortState;
  readonly onSort: (key: SortKey) => void;
  readonly className?: string;
}

function SortHeader({ label, sortKey, sort, onSort, className }: SortHeaderProps) {
  const active = sort.key === sortKey;
  return (
    <th scope="col" className={className} aria-sort={active ? sort.direction : undefined}>
      <button type="button" className="sort" data-sort={sortKey} data-direction={active ? sort.direction : undefined} onClick={() => onSort(sortKey)}>
        {label}
        <Icon name="chev-d" className="icon icon-sm sort-icon" />
      </button>
    </th>
  );
}

function SelectAll({ materials, audience, selected, onToggleAll }: Pick<MaterialsTableProps, 'materials' | 'audience' | 'selected' | 'onToggleAll'>) {
  const ref = useRef<HTMLInputElement>(null);
  const selectable = materials.filter((material) => isSelectable(material, audience)).map((material) => material.id);
  const count = selectable.filter((id) => selected.includes(id)).length;
  const all = selectable.length > 0 && count === selectable.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <input
      ref={ref}
      className="cb"
      type="checkbox"
      checked={all}
      disabled={selectable.length === 0}
      aria-label="Вибрати всі показані матеріали з файлами"
      data-select-all
      onChange={() => onToggleAll(selectable, !all)}
    />
  );
}

export function MaterialsTable(props: MaterialsTableProps) {
  const { materials, audience, exportMode, selected, sort, onSort, onToggle } = props;
  return (
    <div className="table-wrap" role="region" aria-label="Таблиця матеріалів, прокручується горизонтально" tabIndex={0}>
      <table className="mat-table" data-materials-table>
        <thead>
          <tr>
            {exportMode && (
              <th scope="col" className="col-cb">
                <SelectAll {...props} />
              </th>
            )}
            <SortHeader label="Матеріал" sortKey="title" sort={sort} onSort={onSort} />
            <SortHeader label="Тип" sortKey="type" sort={sort} onSort={onSort} />
            <SortHeader label="Тема" sortKey="topic" sort={sort} onSort={onSort} />
            <th scope="col">ПРН</th>
            <th scope="col">Блум</th>
            <th scope="col">Формати</th>
            <SortHeader label="Розмір" sortKey="size" sort={sort} onSort={onSort} className="num" />
            <SortHeader label="Оновлено" sortKey="updated" sort={sort} onSort={onSort} className="num" />
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => {
            const checked = selected.includes(material.id);
            return (
              <tr key={material.id} data-material={material.id} data-status={material.status} data-selected={exportMode && checked ? 'true' : undefined}>
                {exportMode && (
                  <td className="col-cb">
                    <SelectBox material={material} audience={audience} checked={checked} onToggle={onToggle} />
                  </td>
                )}
                <td className="col-name">
                  <MaterialTitle material={material} /> <PendingChip material={material} />
                  {material.subtitle && <span className="mat-sub">{material.subtitle}</span>}
                  <BankLink material={material} audience={audience} />
                </td>
                <td>
                  <TypeLabel material={material} />
                </td>
                <td className="num">{placeLabel(material)}</td>
                <td className="num">{outcomeNumbers(material) || '—'}</td>
                <td>
                  <BloomMini material={material} />
                </td>
                <td>
                  <FormatBoxes material={material} audience={audience} />
                </td>
                <td className="num">{sizeLabel(material, audience)}</td>
                <td className="num">{material.updatedLabel ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
