/** Картки матеріалів: тип і тема, назва, опис, ПРН і Блум, формати й розмір; чекбокс у режимі вивантаження. */
import { visibleFiles } from './filter';
import { BankLink, BloomMini, FormatBoxes, MaterialTitle, PendingChip, SelectBox, TypeLabel, outcomeNumbers, sizeLabel } from './MaterialBits';
import type { Audience, Material } from './types';

export interface MaterialCardsProps {
  readonly materials: readonly Material[];
  readonly audience: Audience;
  readonly exportMode: boolean;
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
}

export function MaterialCards({ materials, audience, exportMode, selected, onToggle }: MaterialCardsProps) {
  return (
    <ul className="cards-grid" data-materials-cards>
      {materials.map((material) => {
        const checked = selected.includes(material.id);
        const outcomes = outcomeNumbers(material);
        return (
          <li key={material.id} className="card mcard" data-material={material.id} data-status={material.status} data-selected={exportMode && checked ? 'true' : undefined}>
            <div className="mcard-top">
              <TypeLabel material={material} withTopic />
              <PendingChip material={material} />
              {exportMode && <SelectBox material={material} audience={audience} checked={checked} onToggle={onToggle} />}
            </div>
            <h3>
              <MaterialTitle material={material} />
            </h3>
            {material.subtitle && <p className="mcard-sub">{material.subtitle}</p>}
            <div className="mcard-meta">
              {outcomes && <span>ПРН {outcomes}</span>}
              {material.bloom && <BloomMini material={material} />}
            </div>
            {visibleFiles(material, audience).length > 0 && (
              <div className="row">
                <FormatBoxes material={material} audience={audience} />
                <span className="num">{sizeLabel(material, audience)}</span>
              </div>
            )}
            <BankLink material={material} audience={audience} />
          </li>
        );
      })}
    </ul>
  );
}
