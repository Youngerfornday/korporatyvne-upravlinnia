/**
 * React-острів кабінету викладача. Режим перегляду, а не межа безпеки: усе, що тут видно, і так опубліковано
 * на сайті. Сервер рендерить типовий стан (вид викладача, таблиця), після гідрації — збережений вид і ?vid=.
 */
import { useMemo, useState } from 'react';
import type { DownloadFormat } from '../../content/schemas/downloads';
import { CabinetHead } from './CabinetHead';
import { ExportPanel } from './ExportPanel';
import { DEFAULT_SORT, EMPTY_FILTERS, countByType, filterMaterials, nextSort, sortMaterials, type MaterialFilters, type SortKey, type SortState } from './filter';
import { MaterialCards } from './MaterialCards';
import { MaterialsTable } from './MaterialsTable';
import { MoodleMemo } from './MoodleMemo';
import { OutcomeMatrixView } from './OutcomeMatrixView';
import { ReadyPackages } from './ReadyPackages';
import { ResultsLine } from './ResultsLine';
import { archiveEntries, availableFormats, isSelectable, summarizeSelection } from './selection';
import { TypeChips, Toolbar, panelId, tabId } from './Toolbar';
import type { Catalog, OutcomeMatrix } from './types';
import { useCabinetView } from './use-cabinet-view';
import { useZipExport } from './use-zip-export';

export interface CabinetIslandProps {
  readonly catalog: Catalog;
  readonly matrix: OutcomeMatrix;
  readonly moodleGuideHref: string;
  readonly buildCommand: string;
  /** Дата маніфесту дд.мм.рррр для підпису готових пакетів. */
  readonly generatedLabel?: string | undefined;
}

export function CabinetIsland({ catalog, matrix, moodleGuideHref, buildCommand, generatedLabel }: CabinetIslandProps) {
  const view = useCabinetView();
  const { audience, presentation } = view;
  const [filters, setFilters] = useState<MaterialFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [exportMode, setExportMode] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const formats = useMemo(() => availableFormats(catalog.materials, audience), [catalog.materials, audience]);
  const [excludedFormats, setExcludedFormats] = useState<readonly DownloadFormat[]>([]);
  const zip = useZipExport();

  const hasManifest = catalog.manifestGeneratedAt !== null;
  const chosenFormats = formats.filter((format) => !excludedFormats.includes(format));
  const filtered = useMemo(() => filterMaterials(catalog.materials, filters), [catalog.materials, filters]);
  const sorted = useMemo(() => sortMaterials(filtered, sort, audience), [filtered, sort, audience]);
  const counts = useMemo(() => countByType(catalog.materials, filters), [catalog.materials, filters]);
  const summary = summarizeSelection(catalog.materials, selected, audience, chosenFormats);
  const selectableInFilter = filtered.filter((material) => isSelectable(material, audience)).map((material) => material.id);
  const isMatrix = presentation === 'matrytsia';
  const showExport = exportMode && !isMatrix;

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const toggleAll = (ids: readonly string[], select: boolean) =>
    setSelected((current) => (select ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id))));
  const toggleFormat = (format: DownloadFormat) =>
    setExcludedFormats((current) => (current.includes(format) ? current.filter((f) => f !== format) : [...current, format]));

  const build = () =>
    zip.start(archiveEntries(summary), {
      courseTitle: catalog.courseTitle,
      sourceUrl: window.location.href,
      manifestGeneratedAt: catalog.manifestGeneratedAt,
      absoluteUrl: (href) => new URL(href, window.location.href).href,
    });

  const listProps = { materials: sorted, audience, exportMode: showExport, selected, onToggle: toggle };

  return (
    <div className="cabinet" data-cabinet data-hydrated={view.hydrated ? 'true' : 'false'} data-audience={audience} data-export={showExport ? 'on' : 'off'}>
      <CabinetHead catalog={catalog} audience={audience} onAudience={view.setAudience} />
      {audience === 'student' && (
        <p className="student-note" role="status">
          Так кабінет бачить студент: без ключів відповідей, файлів для викладача й пакетів для Moodle.
        </p>
      )}
      <Toolbar
        presentation={presentation}
        modules={catalog.modules}
        filters={filters}
        exportMode={exportMode}
        onPresentation={view.setPresentation}
        onFilters={setFilters}
        onExportMode={setExportMode}
      />
      {!isMatrix && <TypeChips filters={filters} counts={counts} onFilters={setFilters} />}
      {!isMatrix && (
        <ResultsLine
          shown={filtered.length}
          total={catalog.materials.length}
          filters={filters}
          modules={catalog.modules}
          sort={sort}
          onReset={() => setFilters(EMPTY_FILTERS)}
        />
      )}

      <section className="view" id={panelId(presentation)} role="tabpanel" aria-labelledby={tabId(presentation)} data-view={presentation}>
        {isMatrix && <OutcomeMatrixView matrix={matrix} moduleId={filters.moduleId} query={filters.query} />}
        {!isMatrix && filtered.length === 0 && (
          <p className="empty">
            Нічого не знайдено.{' '}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
              Скинути фільтри
            </button>
          </p>
        )}
        {presentation === 'tablytsia' && filtered.length > 0 && (
          <MaterialsTable {...listProps} sort={sort} onSort={(key: SortKey) => setSort((current) => nextSort(current, key))} onToggleAll={toggleAll} />
        )}
        {presentation === 'kartky' && filtered.length > 0 && <MaterialCards {...listProps} />}
      </section>

      {showExport && (
        <ExportPanel
          hasManifest={hasManifest}
          buildCommand={buildCommand}
          summary={summary}
          formats={formats}
          chosenFormats={chosenFormats}
          selectableInFilter={selectableInFilter.length}
          zip={zip.state}
          onToggleFormat={toggleFormat}
          onSelectFiltered={() => toggleAll(selectableInFilter, true)}
          onClear={() => setSelected([])}
          onBuild={build}
          onCancel={zip.cancel}
        />
      )}

      <ReadyPackages packages={catalog.packages} audience={audience} hasManifest={hasManifest} generatedLabel={generatedLabel} buildCommand={buildCommand} />
      {audience === 'teacher' && <MoodleMemo moodleGuideHref={moodleGuideHref} />}
    </div>
  );
}
