/**
 * Тести курсу: слоти випадкових питань з фільтром «категорія банку + тег рівня Блума» і дати закриття.
 *
 * Рівень Блума в банку — тег (`bloom-remember` тощо), а категорія — модуль або тема, тому
 * `\mod_quiz\structure::add_random_questions()` з обома умовами дає потрібний баланс питань.
 */

const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze'];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Placeholder-дати рахуються від понеділка першого тижня; час закриття — кінець дня за київським часом. */
const CLOSE_TIME = 'T23:59:00+03:00';

export function bloomTag(level) {
  return `bloom-${level}`;
}

/**
 * Корінь дерева категорій банку за видом і пулом (tools/export/moodle-xml.ts, BANK_ROOTS):
 * `tr`/`ct` — модульний пул, `tr-final`/`ct-final` — пул підсумкового тесту. Різні корені —
 * саме те, що не дає модульному тесту витягти питання підсумкового.
 */
export function bankRootIdnumber(kind, pool = 'module') {
  const base = kind === 'control' ? 'ct' : 'tr';
  return pool === 'final' ? `${base}-final` : base;
}

/** Понеділок, з якого рахуються placeholder-дати закриття тестів. */
export function defaultStartDate(today = new Date()) {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const shift = (8 - date.getUTCDay()) % 7 || 7;
  return new Date(date.getTime() + shift * DAY_MS);
}

/** Кінець навчального тижня `week` (неділя) як unix-час: саме тоді закривається тест. */
export function weekCloseTimestamp(start, week) {
  const end = new Date(start.getTime() + week * 7 * DAY_MS - DAY_MS);
  const day = end.toISOString().slice(0, 10);
  return Math.floor(Date.parse(`${day}${CLOSE_TIME}`) / 1000);
}

/** Тиждень, у якому календарний план ставить діяльність заданого типу. */
export function scheduledWeek(calendar, match) {
  for (const week of calendar?.schedule ?? []) {
    if ((week.activities ?? []).some(match)) return week.week;
  }
  return null;
}

/** Скільки питань доступно в кожній парі «категорія + тег» за маніфестами експорту питань. */
export function poolSizes(questionManifests) {
  const pools = new Map();
  for (const manifest of questionManifests ?? []) {
    for (const question of manifest?.questions ?? []) {
      for (const tag of question.tags) {
        const key = `${question.category}/${tag}`;
        pools.set(key, (pools.get(key) ?? 0) + 1);
      }
    }
  }
  return pools;
}

/**
 * Сума питань категорії-предка: слот модульного тесту бере питання з усіх тем модуля
 * (`includeSubcategories`), тому пул рахується за префіксом idnumber теми в межах того самого виду банку.
 */
function poolFor(pools, categoryIdnumber, tag, subcategoryIdnumbers) {
  const own = pools.get(`${categoryIdnumber}/${tag}`) ?? 0;
  return subcategoryIdnumbers.reduce((total, idnumber) => total + (pools.get(`${idnumber}/${tag}`) ?? 0), own);
}

/**
 * Слоти модульного тесту: по кожному рівню Блума — своя кількість випадкових питань
 * з категорії модуля разом з підкатегоріями тем.
 */
export function moduleTestSlots({ kind, moduleId, topicIds, bloom, pools }) {
  const root = bankRootIdnumber(kind, 'module');
  const category = `${root}-${moduleId}`;
  const subcategories = topicIds.map((topicId) => `${root}-${topicId}`);
  return BLOOM_LEVELS.filter((level) => (bloom[level] ?? 0) > 0).map((level) => {
    const tag = bloomTag(level);
    return {
      categoryIdnumber: category,
      includeSubcategories: true,
      tag,
      count: bloom[level],
      available: poolFor(pools, category, tag, subcategories),
    };
  });
}

/** Слоти підсумкового тесту: матриця «тема × рівень Блума» з реєстру курсу. */
export function finalTestSlots({ kind, matrix, pools }) {
  const root = bankRootIdnumber(kind, 'final');
  return matrix.flatMap((row) =>
    BLOOM_LEVELS.filter((level) => (row[level] ?? 0) > 0).map((level) => {
      const category = `${root}-${row.topic}`;
      const tag = bloomTag(level);
      return {
        categoryIdnumber: category,
        includeSubcategories: false,
        tag,
        count: row[level],
        available: poolFor(pools, category, tag, []),
      };
    }),
  );
}

/** Слоти, для яких у банку замало питань: Moodle створить слот, але спроба студента впаде. */
export function shortPools(slots, quizName) {
  return slots
    .filter((slot) => slot.available < slot.count)
    .map(
      (slot) =>
        `${quizName}: у категорії ${slot.categoryIdnumber} з тегом ${slot.tag} лише ${slot.available} питань, потрібно ${slot.count}`,
    );
}

/**
 * Перегляд спроби контрольного тесту: бали одразу, правильні відповіді — лише після закриття.
 * Значення полів — як у формі модуля; без `timeclose` «після закриття» не настає ніколи.
 */
export function reviewSettings() {
  const settings = { maxmarksduring: 1 };
  for (const item of ['attempt', 'marks', 'maxmarks', 'overallfeedback']) {
    Object.assign(settings, {
      [`${item}during`]: 0,
      [`${item}immediately`]: 1,
      [`${item}open`]: 1,
      [`${item}closed`]: 1,
    });
  }
  for (const item of ['correctness', 'specificfeedback', 'generalfeedback', 'rightanswer']) {
    Object.assign(settings, {
      [`${item}during`]: 0,
      [`${item}immediately`]: 0,
      [`${item}open`]: 0,
      [`${item}closed`]: 1,
    });
  }
  settings.maxmarksduring = 1;
  return settings;
}
