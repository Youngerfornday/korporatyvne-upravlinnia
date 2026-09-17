/**
 * Дані пакета SCORM, які збірка вбудовує в index.html (`<script type="application/json" id="ku-scorm-data">`).
 * Спільні для збирача (Node) і коду пакета (браузер), тому без залежностей від Node чи DOM-збірки.
 */
import type { CompanyTaskDefinition, MatrixDefinition } from '../../../../src/engines/matrix';
import type { MatrixRubric } from '../../../../src/components/trainers/matrix/MatrixPanels';
import type { MatrixSources } from '../../../../src/components/trainers/matrix/SourceLinks';

export const PACKAGE_DATA_ELEMENT_ID = 'ku-scorm-data';
export const PACKAGE_ROOT_ELEMENT_ID = 'ku-scorm-root';
export const PACKAGE_NOTICE_ELEMENT_ID = 'ku-scorm-notice';

export type ScormPackageKind = 'matrix' | 'quorum' | 'cumulative' | 'dividends';

export const SCORM_PACKAGE_KINDS: readonly ScormPackageKind[] = ['matrix', 'quorum', 'cumulative', 'dividends'];

interface PackageBase {
  readonly activityId: string;
  /** Прохідний бал 0..100: той самий, що `adlcp:masteryscore` у маніфесті. */
  readonly masteryPercent: number;
}

export interface MatrixPackageData extends PackageBase {
  readonly kind: 'matrix';
  readonly practicalId: string;
  readonly matrix: MatrixDefinition;
  readonly sources: MatrixSources;
  readonly rubric: MatrixRubric;
  readonly companyTasks: readonly CompanyTaskDefinition[];
}

export interface CalculatorPackageData extends PackageBase {
  readonly kind: Exclude<ScormPackageKind, 'matrix'>;
}

export type ScormPackageData = MatrixPackageData | CalculatorPackageData;

/** JSON для вбудовування в `<script>`: `<` екранується, тож текст контенту не закриє тег. */
export function packageDataScript(data: ScormPackageData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Розбирає вбудовані дані й перевіряє, що вони належать пакету очікуваного виду. */
export function parsePackageData(text: string | null | undefined, kind: ScormPackageKind): ScormPackageData {
  let data: unknown;
  try {
    data = JSON.parse(text ?? '');
  } catch {
    throw new Error('Дані пакета SCORM пошкоджені: index.html не містить коректного JSON.');
  }
  if (!isRecord(data) || data['kind'] !== kind) throw new Error(`Дані пакета SCORM не належать тренажеру «${kind}».`);
  const mastery = data['masteryPercent'];
  if (typeof data['activityId'] !== 'string' || typeof mastery !== 'number' || mastery < 0 || mastery > 100) {
    throw new Error('Дані пакета SCORM не містять ID активності або прохідного бала.');
  }
  if (kind === 'matrix' && !(isRecord(data['matrix']) && isRecord(data['rubric']) && isRecord(data['sources']) && Array.isArray(data['companyTasks']))) {
    throw new Error('Дані пакета SCORM не містять матриці, рубрики чи джерел.');
  }
  return data as unknown as ScormPackageData;
}
