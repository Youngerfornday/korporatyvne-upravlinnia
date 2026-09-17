import { findDuplicates } from '../../src/content/schemas/primitives.ts';
import type { BankFile, Question } from '../../src/content/schemas/questions.ts';
import { ddwtosBody, matchingBody, multichoiceBody, trueFalseBody } from './choice-questions.ts';
import { clozeBody } from './cloze-question.ts';
import { calculatedBody, numericalBody } from './numeric-questions.ts';
import { htmlField, tagsField } from './question-parts.ts';
import {
  categoryPath,
  indexTopics,
  moduleCategoryName,
  moduleOrder,
  throwIfProblems,
  topicCategoryName,
  type CourseRegistry,
  type TopicPlace,
} from './registry.ts';
import { escapeHtml, htmlText, typo } from './text.ts';
import { cdataElement, element, serializeXml, textElement, type XmlElement } from './xml.ts';

/**
 * Банк питань (провалідований BankFileSchema) + реєстр курсу → Moodle XML для `qformat_xml`
 * (імпорт із matchgrades=error, catfromfile=true, contextfromfile=false — як у спайку).
 * Категорії: `top/Модуль N. Назва/Тема NN. Назва` без `$course$`, idnumber категорій — ID модуля й теми;
 * теги: `bloom-<рівень>` і `topic-tNN`; idnumber питання — його ID. Поле canary у вивід не потрапляє.
 */

export type BankKind = BankFile['kind'];
export type BankPool = BankFile['pool'];

interface BankRoot {
  readonly idnumber: string;
  readonly name: string;
  readonly info: string;
}

/**
 * Корінь дерева категорій за видом банку й пулом тесту. Тренувальні, контрольні модульні й контрольні
 * підсумкові питання живуть у різних гілках і мають різні idnumber, тож навіть в одному курсі випадковий
 * слот тесту з фільтром «категорія теми + тег» бере лише питання свого банку й свого пулу.
 */
export const BANK_ROOTS = {
  training: {
    module: { idnumber: 'tr', name: 'Тренувальний банк', info: 'Тренувальні питання курсу: відкриті банки з поясненнями.' },
    final: {
      idnumber: 'tr-final',
      name: 'Тренувальний банк. Підсумковий',
      info: 'Тренувальні питання для репетиції підсумкового тесту.',
    },
  },
  control: {
    module: { idnumber: 'ct', name: 'Контрольний банк', info: 'Контрольні питання модульних тестів.' },
    final: {
      idnumber: 'ct-final',
      name: 'Контрольний банк. Підсумковий',
      info: 'Контрольні питання підсумкового тесту: матриця «теми × рівні».',
    },
  },
} as const satisfies Record<BankKind, Record<BankPool, BankRoot>>;

const POOL_LABEL = { module: 'модульний', final: 'підсумковий' } as const;
const POOL_LABEL_GENITIVE = { module: 'модульного', final: 'підсумкового' } as const;
/** Назва типу в базі Moodle (`question.qtype`). */
export type MoodleQtype = 'multichoice' | 'truefalse' | 'match' | 'numerical' | 'calculated' | 'ddwtos' | 'multianswer';

const XML_TYPES: Readonly<Record<Question['type'], string>> = {
  multichoice: 'multichoice',
  truefalse: 'truefalse',
  matching: 'matching',
  numerical: 'numerical',
  calculated: 'calculated',
  ddwtos: 'ddwtos',
  multianswer: 'cloze',
};

const DB_TYPES: Readonly<Record<Question['type'], MoodleQtype>> = {
  multichoice: 'multichoice',
  truefalse: 'truefalse',
  matching: 'match',
  numerical: 'numerical',
  calculated: 'calculated',
  ddwtos: 'ddwtos',
  multianswer: 'multianswer',
};

export interface PlannedCategory {
  readonly idnumber: string;
  readonly path: string;
  /** idnumber батьківської категорії; null — безпосередньо під `top`. */
  readonly parent: string | null;
  readonly infoHtml: string;
}

export interface PlannedQuestion {
  readonly question: Question;
  readonly category: string;
  readonly tags: readonly string[];
}

export interface QuestionSection {
  readonly category: PlannedCategory;
  readonly questions: readonly PlannedQuestion[];
}

export interface QuestionExportPlan {
  readonly kind: BankKind;
  readonly pool: BankPool;
  readonly sections: readonly QuestionSection[];
  /** Canary контрольних банків — лише для перевірки, що жоден із них не потрапив у вивід. */
  readonly canaries: readonly string[];
}

export function questionTags(question: Question): string[] {
  return [`bloom-${question.bloom}`, `topic-${question.topic}`];
}

function questionPlaceProblems(bank: BankFile, topics: ReadonlyMap<string, TopicPlace>): string[] {
  return bank.questions.flatMap((question) => {
    const place = topics.get(question.topic);
    if (!place) return [`Питання «${question.id}»: тему «${question.topic}» не зареєстровано в course.yaml`];
    if (place.module.id !== bank.module) {
      return [`Питання «${question.id}» належить модулю ${place.module.id}, а банк — модулю ${bank.module}`];
    }
    return [];
  });
}

/** Усі причини, з яких банки не можна експортувати разом; порожній список — можна. */
export function findBankProblems(banks: readonly BankFile[], course: CourseRegistry): string[] {
  if (banks.length === 0) return ['Немає жодного банку питань для експорту'];
  const topics = indexTopics(course);
  const kinds = new Set(banks.map((bank) => bank.kind));
  const pools = new Set(banks.map((bank) => bank.pool));
  return [
    ...(kinds.size > 1 ? ['Тренувальні й контрольні банки не можна змішувати в одному файлі'] : []),
    ...(pools.size > 1 ? ['Банки модульного й підсумкового пулів не можна змішувати в одному файлі'] : []),
    ...findDuplicates(banks.map((bank) => `${bank.module}|${bank.pool}`)).map((key) => {
      const [module, pool] = key.split('|') as [string, BankPool];
      return `Модуль ${module} має більше одного банку для ${POOL_LABEL_GENITIVE[pool]} пулу`;
    }),
    ...banks
      .filter((bank) => moduleOrder(course, bank.module) < 0)
      .map((bank) => `Модуль банку «${bank.module}» не зареєстровано в course.yaml`),
    ...banks.flatMap((bank) => questionPlaceProblems(bank, topics)),
    ...findDuplicates(banks.flatMap((bank) => bank.questions.map((question) => question.id))).map(
      (id) => `Дублікат ID питання «${id}» у банках`,
    ),
  ];
}

/** Порядок виводу — порядок реєстру (модуль, тема), усередині теми — порядок у банку. */
export function planQuestionExport(banks: readonly BankFile[], course: CourseRegistry): QuestionExportPlan {
  throwIfProblems(findBankProblems(banks, course));
  const kind = banks[0]?.kind ?? 'training';
  const pool = banks[0]?.pool ?? 'module';
  const root = BANK_ROOTS[kind][pool];
  const questions = banks.flatMap((bank) => bank.questions);
  const moduleSections = course.modules.flatMap((module): QuestionSection[] => {
    const moduleTopics = course.topics.filter((topic) => topic.module === module.id);
    const topicSections = moduleTopics.flatMap((topic): QuestionSection[] => {
      const inTopic = questions.filter((question) => question.topic === topic.id);
      if (inTopic.length === 0) return [];
      const idnumber = `${root.idnumber}-${topic.id}`;
      const category = {
        idnumber,
        path: categoryPath(root.name, moduleCategoryName(module), topicCategoryName(topic)),
        parent: `${root.idnumber}-${module.id}`,
        infoHtml: htmlText(topic.summary),
      };
      return [{ category, questions: inTopic.map((question) => ({ question, category: idnumber, tags: questionTags(question) })) }];
    });
    if (topicSections.length === 0) return [];
    const moduleCategory = {
      idnumber: `${root.idnumber}-${module.id}`,
      path: categoryPath(root.name, moduleCategoryName(module)),
      parent: root.idnumber,
      infoHtml: `<p>${escapeHtml(typo(module.title))}</p>`,
    };
    return [{ category: moduleCategory, questions: [] }, ...topicSections];
  });
  const rootSection: QuestionSection = {
    category: { idnumber: root.idnumber, path: categoryPath(root.name), parent: null, infoHtml: `<p>${escapeHtml(root.info)}</p>` },
    questions: [],
  };
  const sections = moduleSections.length === 0 ? [] : [rootSection, ...moduleSections];
  const canaries = banks.flatMap((bank) => (bank.kind === 'control' && bank.canary ? [bank.canary] : []));
  return { kind, pool, sections, canaries };
}

function questionBody(question: Question): XmlElement[] {
  switch (question.type) {
    case 'multichoice':
      return multichoiceBody(question);
    case 'truefalse':
      return trueFalseBody(question);
    case 'matching':
      return matchingBody(question);
    case 'numerical':
      return numericalBody(question);
    case 'calculated':
      return calculatedBody(question);
    case 'ddwtos':
      return ddwtosBody(question);
    case 'multianswer':
      return clozeBody(question);
  }
}

function categoryElement(category: PlannedCategory): XmlElement {
  return element(
    'question',
    [element('category', [cdataElement('text', category.path)]), htmlField('info', category.infoHtml), textElement('idnumber', category.idnumber)],
    { type: 'category' },
  );
}

function questionElement(planned: PlannedQuestion): XmlElement {
  return element('question', [...questionBody(planned.question), tagsField(planned.tags)], {
    type: XML_TYPES[planned.question.type],
  });
}

export function renderQuestionPlan(plan: QuestionExportPlan): string {
  const children = plan.sections.flatMap((section) => [categoryElement(section.category), ...section.questions.map(questionElement)]);
  const label = plan.kind === 'control' ? 'контрольний' : 'тренувальний';
  const xml = serializeXml(element('quiz', children), {
    comment: `Moodle XML: ${label} банк питань, ${POOL_LABEL[plan.pool]} пул. Згенеровано tools/export/moodle-xml.ts, не редагуйте вручну. Імпорт: категорії з файлу, оцінки без округлення.`,
  });
  const leaked = plan.canaries.find((canary) => xml.includes(canary));
  if (leaked !== undefined) throw new Error('Canary контрольного банку потрапив у текст Moodle XML: приберіть його з питань');
  return xml;
}

export function banksToMoodleXml(banks: readonly BankFile[], course: CourseRegistry): string {
  return renderQuestionPlan(planQuestionExport(banks, course));
}

export function bankToMoodleXml(bank: BankFile, course: CourseRegistry): string {
  return banksToMoodleXml([bank], course);
}

export interface QuestionManifest {
  readonly kind: BankKind;
  readonly pool: BankPool;
  readonly total: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly categories: ReadonlyArray<Omit<PlannedCategory, 'infoHtml'>>;
  readonly questions: ReadonlyArray<{
    readonly idnumber: string;
    readonly qtype: MoodleQtype;
    readonly category: string;
    readonly defaultMark: number;
    readonly tags: readonly string[];
  }>;
}

/** Очікуваний стан банку Moodle після імпорту — для tools/moodle/import-check.php і збирання курсу. */
export function describeQuestionPlan(plan: QuestionExportPlan): QuestionManifest {
  const questions = plan.sections.flatMap((section) =>
    section.questions.map(({ question, category, tags }) => ({
      idnumber: question.id,
      qtype: DB_TYPES[question.type],
      category,
      defaultMark: question.defaultMark,
      tags,
    })),
  );
  const counts = questions.reduce<Record<string, number>>((acc, { qtype }) => ({ ...acc, [qtype]: (acc[qtype] ?? 0) + 1 }), {});
  return {
    kind: plan.kind,
    pool: plan.pool,
    total: questions.length,
    byType: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    categories: plan.sections.map(({ category: { idnumber, path, parent } }) => ({ idnumber, path, parent })),
    questions,
  };
}
