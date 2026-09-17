/** Липка панель режиму вивантаження: вибір, формати, «Зібрати ZIP», прогрес і помилки завантаження. */
import type { DownloadFormat } from '../../content/schemas/downloads';
import { Icon } from '../quiz/Icon';
import { selectionDetail, type SelectionSummary } from './selection';
import { FILE_FORMS, formatBytes, formatChipLabel, pluralUk, selectionLine } from './texts';
import type { ZipState } from './use-zip-export';

export interface ExportPanelProps {
  readonly hasManifest: boolean;
  readonly buildCommand: string;
  readonly summary: SelectionSummary;
  readonly formats: readonly DownloadFormat[];
  readonly chosenFormats: readonly DownloadFormat[];
  readonly selectableInFilter: number;
  readonly zip: ZipState;
  readonly onToggleFormat: (format: DownloadFormat) => void;
  readonly onSelectFiltered: () => void;
  readonly onClear: () => void;
  readonly onBuild: () => void;
  readonly onCancel: () => void;
}

function ZipStatus({ zip }: { readonly zip: ZipState }) {
  switch (zip.status) {
    case 'fetching':
      return (
        <div className="zip-progress">
          <progress max={zip.total} value={zip.done} aria-label="Завантаження файлів для архіву" />
          <span>
            Завантажено {zip.done} із {pluralUk(zip.total, FILE_FORMS)} · {formatBytes(zip.bytes)}
          </span>
        </div>
      );
    case 'packing':
      return <span>Пакуємо {pluralUk(zip.total, FILE_FORMS)} в архів…</span>;
    case 'done':
      return (
        <span className="zip-ok">
          <Icon name="check" /> Архів {zip.fileName} збережено: {pluralUk(zip.files, FILE_FORMS)} і README.txt, {formatBytes(zip.bytes)}.
        </span>
      );
    case 'cancelled':
      return <span>Збирання скасовано.</span>;
    case 'error':
      return (
        <span className="zip-err">
          <Icon name="alert" /> {zip.message}
        </span>
      );
    default:
      return null;
  }
}

function NoManifest({ buildCommand }: { readonly buildCommand: string }) {
  return (
    <div className="export-empty" data-export-empty>
      <Icon name="info" className="icon icon-lg" />
      <div>
        <b>Матеріали ще не зібрано.</b> Файлів для вивантаження (PDF, Moodle XML, ZIP Книги) на сайті поки немає. Запустіть{' '}
        <code>{buildCommand}</code> і перезберіть сайт — тоді тут можна буде позначити матеріали й отримати архів.
      </div>
    </div>
  );
}

export function ExportPanel(props: ExportPanelProps) {
  const { hasManifest, buildCommand, summary, formats, chosenFormats, selectableInFilter, zip } = props;
  const busy = zip.status === 'fetching' || zip.status === 'packing';
  const canBuild = summary.files.length > 0 && !busy;
  const hint =
    summary.materials.length > 0 && summary.files.length === 0 ? 'У вибраних форматах файлів немає — позначте інші формати.' : selectionDetail(summary);

  return (
    <section className="export-panel" aria-labelledby="export-title" data-export-panel>
      <h2 id="export-title" className="visually-hidden">
        Вивантаження вибраних матеріалів
      </h2>
      {!hasManifest ? (
        <NoManifest buildCommand={buildCommand} />
      ) : (
        <>
          <div className="export-main">
            <div className="sel" aria-live="polite" data-selection-line>
              {selectionLine(summary.materials.length, summary.bytes)}
            </div>
            <div className="detail">{hint}</div>
            <div className="formats" role="group" aria-label="Формати в архіві">
              {formats.map((format) => (
                <button
                  key={format}
                  className="fchip"
                  type="button"
                  aria-pressed={chosenFormats.includes(format)}
                  data-format={format}
                  onClick={() => props.onToggleFormat(format)}
                >
                  {formatChipLabel(format)}
                </button>
              ))}
            </div>
          </div>
          <div className="btns">
            <button className="btn btn-ghost" type="button" disabled={selectableInFilter === 0 || busy} onClick={props.onSelectFiltered} data-select-filtered>
              Вибрати все з фільтра
            </button>
            <button className="btn btn-ghost" type="button" disabled={summary.materials.length === 0 || busy} onClick={props.onClear}>
              Зняти вибір
            </button>
            {busy ? (
              <button className="btn btn-secondary btn-lg" type="button" onClick={props.onCancel}>
                Скасувати
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" type="button" disabled={!canBuild} onClick={props.onBuild} data-build-zip>
                <Icon name="download" />
                Зібрати ZIP
              </button>
            )}
          </div>
          <div className="zip-status" role="status" aria-live="polite" data-zip-status={zip.status}>
            <ZipStatus zip={zip} />
          </div>
        </>
      )}
    </section>
  );
}
