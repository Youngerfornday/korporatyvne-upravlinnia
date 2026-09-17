/** Дрібні елементи матеріалу, спільні для таблиці й карток: формати, Блум, стан, тема, ПРН. */
import { Icon } from '../quiz/Icon';
import { visibleFiles, totalBytes } from './filter';
import { isSelectable } from './selection';
import { BLOOM_TEXT, TYPE_ICONS, TYPE_LABELS, formatBytes, formatLabel, kindLabel } from './texts';
import { BLOOM_LEVELS, type Audience, type Material } from './types';

export function FormatBoxes({ material, audience }: { readonly material: Material; readonly audience: Audience }) {
  const files = visibleFiles(material, audience);
  if (files.length === 0) return <span className="faint">—</span>;
  return (
    <span className="fmt">
      {files.map((file) => (
        <span key={file.id} title={`${kindLabel(file.kind)}: ${file.title}`}>
          {formatLabel(file.format)}
        </span>
      ))}
    </span>
  );
}

export function BloomMini({ material }: { readonly material: Material }) {
  const { bloom } = material;
  if (!bloom) return <span className="faint">—</span>;
  const levels = BLOOM_LEVELS.filter((level) => bloom[level] > 0);
  return (
    <span className="bloom-mini">
      <span aria-hidden="true">
        {levels.map((level) => (
          <span key={level} className="bloom" data-level={level}>
            <i />
            {BLOOM_TEXT[level].short}&nbsp;{bloom[level]}
          </span>
        ))}
      </span>
      <span className="visually-hidden">{levels.map((level) => `${BLOOM_TEXT[level].label} — ${bloom[level]}`).join(', ')}</span>
    </span>
  );
}

export function TypeLabel({ material, withTopic = false }: { readonly material: Material; readonly withTopic?: boolean }) {
  return (
    <span className="type">
      <Icon name={TYPE_ICONS[material.type]} />
      {TYPE_LABELS[material.type]}
      {withTopic && ` · ${placeLabel(material)}`}
    </span>
  );
}

export function PendingChip({ material }: { readonly material: Material }) {
  if (material.status !== 'pending') return null;
  return <span className="chip chip-pending">готується</span>;
}

/** «Т1», «М1» для файлів модуля, «Курс» для документів курсу. */
export function placeLabel(material: Material): string {
  if (material.topicNumber) return `Т${material.topicNumber}`;
  if (material.moduleNumber) return `М${material.moduleNumber}`;
  return 'Курс';
}

/** «ПРН3», «ПРН12» → «3, 12». */
export function outcomeNumbers(material: Material): string {
  return material.outcomes.map((code) => code.replace(/^\D+/, '')).join(', ');
}

export function sizeLabel(material: Material, audience: Audience): string {
  const files = visibleFiles(material, audience);
  return files.length > 0 ? formatBytes(totalBytes(files)) : '—';
}

export function MaterialTitle({ material }: { readonly material: Material }) {
  return material.href ? (
    <a className="mat-name" href={material.href}>
      {material.title}
    </a>
  ) : (
    <span className="mat-name">{material.title}</span>
  );
}

/** Посилання на оглядач банку — лише у виді викладача: у ньому ключі відповідей. */
export function BankLink({ material, audience }: { readonly material: Material; readonly audience: Audience }) {
  if (audience !== 'teacher' || !material.bankHref) return null;
  return (
    <a className="bank-link" href={material.bankHref}>
      Питання й відповіді<span className="visually-hidden">: {material.title}</span>
    </a>
  );
}

export interface SelectBoxProps {
  readonly material: Material;
  readonly audience: Audience;
  readonly checked: boolean;
  readonly onToggle: (id: string) => void;
}

export function SelectBox({ material, audience, checked, onToggle }: SelectBoxProps) {
  const selectable = isSelectable(material, audience);
  const label = selectable ? `Вибрати «${material.title}»` : `«${material.title}»: немає файлів для архіву`;
  return (
    <input
      className="cb"
      type="checkbox"
      checked={selectable && checked}
      disabled={!selectable}
      aria-label={label}
      data-select={material.id}
      onChange={() => onToggle(material.id)}
    />
  );
}
