/** Шапка кабінету: заголовок, лічильники курсу, перемикач виду Викладач / Студент, силабус і друк. */
import { Icon } from '../quiz/Icon';
import { MATERIAL_FORMS, TOPIC_FORMS, pluralUk } from './texts';
import type { Audience, Catalog, MaterialFile } from './types';

export interface CabinetHeadProps {
  readonly catalog: Catalog;
  readonly audience: Audience;
  readonly onAudience: (audience: Audience) => void;
}

const AUDIENCES: readonly { readonly id: Audience; readonly label: string }[] = [
  { id: 'teacher', label: 'Викладач' },
  { id: 'student', label: 'Студент' },
];

function syllabusFile(catalog: Catalog): MaterialFile | undefined {
  return catalog.materials.flatMap((material) => material.files).find((file) => file.kind === 'syllabus');
}

export function CabinetHead({ catalog, audience, onAudience }: CabinetHeadProps) {
  const syllabus = syllabusFile(catalog);
  return (
    <header className="cab-head">
      <div>
        <h1 className="h1">Кабінет викладача</h1>
        <p className="sub">
          Режим перегляду всередині сайту, без входу. <span className="chip chip-tint">{pluralUk(catalog.materials.length, MATERIAL_FORMS)}</span>{' '}
          <span className="chip chip-tint">{pluralUk(catalog.topicCount, TOPIC_FORMS)}</span>{' '}
          <span className="chip chip-tint">{catalog.outcomeCount} ПРН</span>
          {catalog.updatedLabel && ` Оновлено ${catalog.updatedLabel}.`}
        </p>
      </div>
      <div className="cab-quick">
        <div className="view-switch">
          <span className="caps" id="audience-label">
            Показати як
          </span>
          <div className="seg" role="group" aria-labelledby="audience-label">
            {AUDIENCES.map((option) => (
              <button key={option.id} type="button" aria-pressed={audience === option.id} data-audience-option={option.id} onClick={() => onAudience(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="cab-actions">
          {syllabus && (
            <a className="btn btn-secondary" href={syllabus.href} download="">
              <Icon name="file" />
              Силабус {syllabus.format.toUpperCase()}
            </a>
          )}
          <button className="btn btn-secondary" type="button" onClick={() => window.print()}>
            <Icon name="print" />
            Друк
          </button>
        </div>
      </div>
    </header>
  );
}
