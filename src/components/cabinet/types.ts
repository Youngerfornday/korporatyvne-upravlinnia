/**
 * Модель даних кабінету викладача. Каталог будується під час збирання сайту (catalog.ts) і передається
 * острову як серіалізовані пропси: усе тут — прості об’єкти без функцій і класів.
 */
import type { DownloadFormat, DownloadKind } from '../../content/schemas/downloads';
import type { BloomLevel } from '../../content/schemas/questions';

export type MaterialType = 'lecture' | 'practical' | 'bank' | 'glossary' | 'document';
export type Audience = 'student' | 'teacher';
export type MaterialStatus = 'published' | 'pending';

export const MATERIAL_TYPES: readonly MaterialType[] = ['lecture', 'practical', 'bank', 'glossary', 'document'];
export const BLOOM_LEVELS: readonly BloomLevel[] = ['remember', 'understand', 'apply', 'analyze'];

/** Файл з маніфесту матеріалів, прив’язаний до матеріалу або до готових пакетів. */
export interface MaterialFile {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly kind: DownloadKind;
  readonly format: DownloadFormat;
  readonly audience: Audience;
  readonly bytes: number;
  /** Файл сайту — адреса з base; зовнішній файл (GitHub Releases) — повна адреса. */
  readonly href: string;
  readonly external: boolean;
  /** Розширення файлу без крапки: з шляху або з формату. */
  readonly extension: string;
  readonly moduleNumber?: number;
}

export interface QuestionTypeCount {
  readonly label: string;
  readonly count: number;
}

export interface Material {
  readonly id: string;
  readonly type: MaterialType;
  readonly title: string;
  readonly subtitle: string;
  readonly status: MaterialStatus;
  readonly moduleId?: string;
  readonly moduleNumber?: number;
  readonly topicId?: string;
  readonly topicNumber?: number;
  readonly practicalNumber?: number;
  /** Коди ПРН: «ПРН3». */
  readonly outcomes: readonly string[];
  /** Розподіл питань тренувального банку за рівнями Блума. */
  readonly bloom?: Readonly<Record<BloomLevel, number>>;
  readonly questionCount?: number;
  readonly questionTypes?: readonly QuestionTypeCount[];
  /** Сторінка матеріалу на сайті. */
  readonly href?: string;
  /** Оглядач питань тренувального банку. */
  readonly bankHref?: string;
  /** ISO-дата оновлення (для сортування) і її підпис дд.мм.рррр. */
  readonly updatedAt?: string;
  readonly updatedLabel?: string;
  /** Нормалізований текст для пошуку: назва, опис, терміни, ПРН. */
  readonly searchText: string;
  readonly files: readonly MaterialFile[];
  /** Порядок за замовчуванням: модуль → тема → вид матеріалу. */
  readonly order: number;
}

export interface ModuleOption {
  readonly id: string;
  readonly number: number;
  readonly title: string;
}

export interface Catalog {
  readonly courseTitle: string;
  readonly materials: readonly Material[];
  readonly modules: readonly ModuleOption[];
  /** Готові пакети (kind bundle і backup) — окремими картками з прямим завантаженням. */
  readonly packages: readonly MaterialFile[];
  /** null — маніфесту ще немає (npm run build:downloads не запускали). */
  readonly manifestGeneratedAt: string | null;
  readonly topicCount: number;
  readonly outcomeCount: number;
  readonly updatedLabel?: string;
}

export type Coverage = 'both' | 'lecture' | 'practical' | 'none';

export interface MatrixTopic {
  readonly id: string;
  readonly number: number;
  readonly moduleId: string;
  readonly title: string;
  readonly published: boolean;
}

export interface MatrixPractical {
  readonly id: string;
  readonly number: number;
  readonly moduleId: string;
}

export interface MatrixRow {
  readonly id: string;
  readonly code: string;
  readonly statement: string;
  /** Покриття в порядку MatrixTopic. */
  readonly cells: readonly Coverage[];
  readonly practicals: readonly MatrixPractical[];
}

export interface OutcomeMatrix {
  readonly topics: readonly MatrixTopic[];
  readonly rows: readonly MatrixRow[];
}
