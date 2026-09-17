/** Панель кабінету: представлення (вкладки зі стрілками), пошук, модуль, Блум, режим вивантаження, чипи типів. */
import { useRef, type KeyboardEvent } from 'react';
import type { BloomLevel } from '../../content/schemas/questions';
import { Icon } from '../quiz/Icon';
import type { MaterialFilters } from './filter';
import { BLOOM_TEXT, TYPE_LABELS } from './texts';
import { BLOOM_LEVELS, MATERIAL_TYPES, type MaterialType, type ModuleOption } from './types';
import { PRESENTATIONS, type Presentation } from './use-cabinet-view';

const PRESENTATION_TEXT: Readonly<Record<Presentation, { readonly label: string; readonly icon: string }>> = {
  kartky: { label: 'Картки', icon: 'cab-grid' },
  tablytsia: { label: 'Таблиця', icon: 'cab-table' },
  matrytsia: { label: 'Матриця ПРН', icon: 'cab-matrix' },
};

export function panelId(presentation: Presentation): string {
  return `cab-panel-${presentation}`;
}

export function tabId(presentation: Presentation): string {
  return `cab-tab-${presentation}`;
}

const KEY_STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function PresentationTabs({ value, onChange }: { readonly value: Presentation; readonly onChange: (next: Presentation) => void }) {
  const refs = useRef<Partial<Record<Presentation, HTMLButtonElement | null>>>({});
  const focus = (next: Presentation) => {
    onChange(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = PRESENTATIONS.indexOf(value);
    const last = PRESENTATIONS.length - 1;
    const step = KEY_STEP[event.key];
    let next: Presentation | undefined;
    if (step !== undefined) next = PRESENTATIONS[(index + step + PRESENTATIONS.length) % PRESENTATIONS.length];
    else if (event.key === 'Home') next = PRESENTATIONS[0];
    else if (event.key === 'End') next = PRESENTATIONS[last];
    if (!next) return;
    event.preventDefault();
    focus(next);
  };
  return (
    <div className="seg seg--sq" role="tablist" aria-label="Представлення" onKeyDown={onKeyDown}>
      {PRESENTATIONS.map((presentation) => {
        const selected = presentation === value;
        return (
          <button
            key={presentation}
            ref={(node) => {
              refs.current[presentation] = node;
            }}
            id={tabId(presentation)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={selected ? panelId(presentation) : undefined}
            tabIndex={selected ? 0 : -1}
            data-presentation={presentation}
            onClick={() => onChange(presentation)}
          >
            <Icon name={PRESENTATION_TEXT[presentation].icon} className="icon icon-sm" />
            {PRESENTATION_TEXT[presentation].label}
          </button>
        );
      })}
    </div>
  );
}

export interface ToolbarProps {
  readonly presentation: Presentation;
  readonly modules: readonly ModuleOption[];
  readonly filters: MaterialFilters;
  readonly exportMode: boolean;
  readonly onPresentation: (next: Presentation) => void;
  readonly onFilters: (next: MaterialFilters) => void;
  readonly onExportMode: (next: boolean) => void;
}

export function Toolbar({ presentation, modules, filters, exportMode, onPresentation, onFilters, onExportMode }: ToolbarProps) {
  const isMatrix = presentation === 'matrytsia';
  return (
    <div className="toolbar">
      <PresentationTabs value={presentation} onChange={onPresentation} />
      <div className="search grow">
        <Icon name="search" />
        <label className="visually-hidden" htmlFor="cab-q">
          {isMatrix ? 'Пошук ПРН' : 'Пошук матеріалів'}
        </label>
        <input
          className="input"
          id="cab-q"
          type="search"
          value={filters.query}
          placeholder={isMatrix ? 'Номер або формулювання ПРН' : 'Назва, термін або ПРН'}
          onChange={(event) => onFilters({ ...filters, query: event.target.value })}
          autoComplete="off"
        />
      </div>
      <label className="visually-hidden" htmlFor="cab-module">
        Модуль
      </label>
      <select className="select" id="cab-module" value={filters.moduleId} onChange={(event) => onFilters({ ...filters, moduleId: event.target.value })}>
        <option value="">Усі модулі</option>
        {modules.map((module) => (
          <option key={module.id} value={module.id}>
            М{module.number}. {module.title}
          </option>
        ))}
      </select>
      {!isMatrix && (
        <>
          <label className="visually-hidden" htmlFor="cab-bloom">
            Рівень Блума
          </label>
          <select
            className="select"
            id="cab-bloom"
            value={filters.bloom}
            onChange={(event) => onFilters({ ...filters, bloom: event.target.value as BloomLevel | '' })}
          >
            <option value="">Усі рівні Блума</option>
            {BLOOM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {BLOOM_TEXT[level].label}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary export-toggle" type="button" aria-pressed={exportMode} onClick={() => onExportMode(!exportMode)} data-export-toggle>
            <Icon name="cab-archive" />
            Режим вивантаження
          </button>
        </>
      )}
    </div>
  );
}

export interface TypeChipsProps {
  readonly filters: MaterialFilters;
  readonly counts: Readonly<Record<MaterialType, number>>;
  readonly onFilters: (next: MaterialFilters) => void;
}

export function TypeChips({ filters, counts, onFilters }: TypeChipsProps) {
  const toggle = (type: MaterialType) => {
    const types = filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type];
    onFilters({ ...filters, types });
  };
  return (
    <div className="filters" role="group" aria-labelledby="cab-types-label">
      <span className="caps" id="cab-types-label">
        Тип
      </span>
      {MATERIAL_TYPES.map((type) => (
        <button key={type} className="fchip" type="button" aria-pressed={filters.types.includes(type)} data-type={type} onClick={() => toggle(type)}>
          {TYPE_LABELS[type]} <span className="n">{counts[type]}</span>
        </button>
      ))}
    </div>
  );
}
