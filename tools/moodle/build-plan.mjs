#!/usr/bin/env node
/**
 * План збирання курсу Moodle: `content/course.yaml` + артефакти експорту → `plan.json`.
 *
 * Уся предметна логіка (які розділи, які елементи, які слоти тестів, які ваги журналу) живе тут,
 * а `build-course.php` лише виконує план засобами Moodle. Так правила курсу лишаються поруч зі схемою
 * реєстру, а PHP-частина не розбирає YAML.
 *
 * Запуск: node --import ./tools/export/register-ts.mjs tools/moodle/build-plan.mjs --artifacts <каталог> --out <файл>
 *   --course <файл>      реєстр курсу (типово content/course.yaml)
 *   --artifacts <кат.>   каталог з questions-*.xml, glossary-*.xml, manifest.json, books/ і scorm/ (scorm.json)
 *   --out <файл>         куди писати план (типово <artifacts>/plan.json)
 *   --shortname <код>    коротке ім'я курсу в копії (типово KU-KURS)
 *   --start <YYYY-MM-DD> понеділок першого навчального тижня для дат закриття тестів
 *   --site <URL>         адреса живого сайту (типово з astro.config.mjs)
 * Усе, чого ще немає в контенті, потрапляє у warnings плану, а не зупиняє збірку.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { CourseSchema } from '../../src/content/schemas/course.ts';
import { readSiteUrl } from '../export/site-url.ts';
import {
  aboutPageHtml,
  bookIntroHtml,
  caseProjectIntroHtml,
  escapeHtml,
  glossaryIntroHtml,
  moduleNumber,
  practicalIntroHtml,
  quizIntroHtml,
  topicNumber,
  topicPageHtml,
} from './plan/html.mjs';
import {
  bankRootIdnumber,
  defaultStartDate,
  finalTestSlots,
  moduleTestSlots,
  poolSizes,
  reviewSettings,
  scheduledWeek,
  shortPools,
  weekCloseTimestamp,
} from './plan/quizzes.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCHEMA_VERSION = 1;
const DEFAULT_SHORTNAME = 'KU-KURS';
const BANK_NAME = 'Банк питань курсу';
const GLOSSARY_NAME = 'Глосарій курсу';
/** SCORM-тренажери: окрема категорія журналу з вагою 0 — бал видно, підсумок курсу не змінюється. */
const TRAINERS_CATEGORY = 'Тренажери (поза підсумком)';
const SCORM_MAX_GRADE = 100;

/** Рубрика Moodle: критерій → рівні (назва рівня → бали). Назви рівнів мають бути унікальні в критерії. */
function rubricCriteria(rubric, warnings, label) {
  return rubric.map((criterion) => {
    const levels = [];
    const seen = new Set();
    for (const level of criterion.levels) {
      const name = level.description;
      if (seen.has(name)) {
        warnings.push(`${label}: у критерії «${criterion.title}» два рівні з однаковим описом — другий пропущено`);
        continue;
      }
      seen.add(name);
      levels.push({ name, points: level.points });
    }
    return { title: criterion.title, levels };
  });
}

function bookByTopic(booksManifest) {
  return new Map((booksManifest?.books ?? []).map((book) => [book.topic, book]));
}

/**
 * Файли питань з маніфесту експорту: курсові (scope = course) файли кожного виду банку.
 * Scope `course` — модульний пул усіх модулів, scope `final` — пул підсумкового тесту; файли на модуль
 * (scope `m1` тощо) дублюють курсовий і в банк не імпортуються.
 */
function questionFiles(exportManifest) {
  return (exportManifest?.questions ?? []).filter((entry) => entry.scope === 'course' || entry.scope === 'final');
}

function glossaryFile(exportManifest) {
  return (exportManifest?.glossaries ?? []).find((entry) => entry.scope === 'course') ?? null;
}

function topicActivities({ topic, book, site, warnings }) {
  const number = topicNumber(topic.id);
  const title = `Тема ${number}. ${topic.title}`;
  if (book === undefined) {
    warnings.push(`Тема ${topic.id} «${topic.title}»: немає лекції на сайті — у курс не потрапила`);
    return [];
  }
  return [
    {
      type: 'book',
      ref: `book:${topic.id}`,
      name: title,
      intro: bookIntroHtml(topic, site),
      zip: join('books', book.file),
      expectedChapters: book.chapters,
    },
    {
      type: 'page',
      ref: `page:${topic.id}`,
      name: `Тема ${number}. Результати навчання і самостійна робота`,
      content: topicPageHtml(topic, site),
    },
    {
      type: 'url',
      ref: `url:${topic.id}`,
      name: `Тема ${number} на сайті курсу`,
      url: new URL(`temy/${topic.slug}/`, site).toString(),
      description: `<p>Інтерактивна версія теми: схеми, підказки термінів, самоперевірка.</p>`,
    },
    {
      type: 'url',
      ref: `url:test-${topic.id}`,
      name: `Тренувальний тест теми ${number}`,
      url: new URL(`testy/${topic.slug}/`, site).toString(),
      description: `<p>Тренувальний тест з поясненням до кожного варіанта. Бали за нього не нараховуються.</p>`,
    },
  ];
}

function practicalActivity({ practical, site, points, warnings }) {
  const number = String(Number(practical.id.slice(1)));
  const name = `Практична робота ${number}. ${practical.title}`;
  return {
    type: 'assign',
    ref: `assign:${practical.id}`,
    name,
    intro: practicalIntroHtml(practical, site, points),
    grade: points,
    rubric: {
      name: `Рубрика: ${name}`,
      description: 'Критерії оцінювання практичної роботи з реєстру курсу.',
      criteria: rubricCriteria(practical.rubric, warnings, name),
    },
  };
}

/** Пакет SCORM тренажера практичної (індекс scorm.json з tools/export/scorm). */
function scormActivity(pkg) {
  return {
    type: 'scorm',
    ref: `scorm:${pkg.id}`,
    name: `${pkg.title} (SCORM)`,
    intro:
      `<p>Інтерактивний тренажер практичної роботи. Бал 0–${SCORM_MAX_GRADE} і статус (зараховано від ${escapeHtml(String(pkg.masteryPercent))} балів) ` +
      `потрапляють у журнал оцінок у категорію «${escapeHtml(TRAINERS_CATEGORY)}» і на підсумок курсу не впливають. ` +
      'Прогрес зберігається між входами.</p>',
    zip: join('scorm', pkg.file),
    maxgrade: SCORM_MAX_GRADE,
    masteryPercent: pkg.masteryPercent,
  };
}

function moduleQuizActivity({ module, topics, grading, kind, pools, start, calendar, warnings }) {
  const number = moduleNumber(module.id);
  const name = `Модульний тест ${number}`;
  const settings = grading.moduleTests;
  const points = grading.categories.find((category) => category.id === 'module-tests')?.pointsPerItem ?? 6;
  const week = scheduledWeek(calendar, (activity) => activity.type === 'module-test' && activity.module === module.id);
  const slots = moduleTestSlots({
    kind,
    moduleId: module.id,
    topicIds: topics.map((topic) => topic.id),
    bloom: settings.bloom,
    pools,
  });
  warnings.push(...shortPools(slots, name));
  if (week === null) warnings.push(`${name}: у календарному плані немає тижня для модульного тесту — дату закриття не задано`);
  return {
    type: 'quiz',
    ref: `quiz:${module.id}`,
    name,
    intro: quizIntroHtml({
      questions: settings.questions,
      minutes: settings.timeLimitMinutes,
      attempts: settings.attempts,
      points,
      scope: `Контрольний тест модуля ${number}:`,
      closeNote:
        week === null ? undefined : `Тест закривається наприкінці ${week}-го навчального тижня; точну дату виставляє викладач.`,
    }),
    grade: points,
    timelimit: settings.timeLimitMinutes * 60,
    attempts: settings.attempts,
    timeclose: week === null ? 0 : weekCloseTimestamp(start, week),
    review: reviewSettings(),
    slots,
  };
}

function finalQuizActivity({ grading, kind, pools, start, calendar, warnings }) {
  const settings = grading.finalTest;
  const points = grading.categories.find((category) => category.id === 'final-test')?.pointsPerItem ?? 40;
  const name = 'Підсумковий тест';
  const week = scheduledWeek(calendar, (activity) => activity.type === 'final-test');
  const slots = finalTestSlots({ kind, matrix: settings.matrix, pools });
  const planned = slots.reduce((total, slot) => total + slot.count, 0);
  warnings.push(...shortPools(slots, name));
  if (planned !== settings.questions) {
    warnings.push(`${name}: матриця дає ${planned} питань замість ${settings.questions}`);
  }
  return {
    type: 'quiz',
    ref: 'quiz:final',
    name,
    intro: quizIntroHtml({
      questions: settings.questions,
      minutes: settings.timeLimitMinutes,
      attempts: settings.attempts,
      points,
      scope: 'Підсумковий тест (диференційований залік):',
      closeNote:
        week === null ? undefined : `Тест закривається наприкінці ${week}-го навчального тижня; точну дату виставляє викладач.`,
    }),
    grade: points,
    timelimit: settings.timeLimitMinutes * 60,
    attempts: settings.attempts,
    timeclose: week === null ? 0 : weekCloseTimestamp(start, week),
    review: reviewSettings(),
    slots,
  };
}

function caseProjectActivity({ grading, warnings }) {
  const points = grading.categories.find((category) => category.id === 'case-project')?.pointsPerItem ?? 12;
  const name = `Кейс-проєкт «${grading.caseProject.title}»`;
  return {
    type: 'assign',
    ref: 'assign:case',
    name,
    intro: caseProjectIntroHtml(grading.caseProject, points),
    grade: points,
    rubric: {
      name: `Рубрика: ${name}`,
      description: 'Критерії оцінювання кейс-проєкту з реєстру курсу.',
      criteria: rubricCriteria(grading.caseProject.rubric, warnings, name),
    },
  };
}

function gradebookPlan(grading, refs) {
  const byCategory = {
    practicals: refs.filter((ref) => ref.startsWith('assign:p')),
    'module-tests': refs.filter((ref) => ref.startsWith('quiz:m')),
    'case-project': refs.filter((ref) => ref === 'assign:case'),
    'final-test': refs.filter((ref) => ref === 'quiz:final'),
  };
  const trainers = refs.filter((ref) => ref.startsWith('scorm:'));
  return grading.categories
    .map((category) => ({
      name: category.title,
      weight: category.items * category.pointsPerItem,
      refs: byCategory[category.id] ?? [],
    }))
    .filter((category) => category.refs.length > 0)
    .concat(trainers.length > 0 ? [{ name: TRAINERS_CATEGORY, weight: 0, refs: trainers }] : []);
}

export function buildPlan({ course, exportManifest, booksManifest, scormIndex = null, site, shortname, start }) {
  const warnings = [];
  const scormPackages = scormIndex?.packages ?? [];
  if (scormPackages.length === 0) {
    warnings.push('Пакетів SCORM немає: тренажери в курс не додано — зберіть їх командою npm run export:scorm -- --out <artifacts>/scorm');
  }
  const books = bookByTopic(booksManifest);
  const files = questionFiles(exportManifest);
  const control = files.filter((file) => file.kind === 'control');
  const training = files.filter((file) => file.kind === 'training');
  const source = control.length > 0 ? control : training;
  const kind = control.length > 0 ? 'control' : 'training';
  if (source.length === 0) {
    warnings.push('Банку питань немає: тести створено з порожніми слотами — доекспортуйте банки і зберіть пакет ще раз');
  } else if (control.length === 0) {
    warnings.push(
      'УВАГА: контрольного банку немає — тести наповнено з ТРЕНУВАЛЬНОГО банку, відповіді до якого відкриті на сайті. ' +
        'Для видачі студентам зберіть пакет із --control <каталог контрольних банків>.',
    );
  }
  const pools = poolSizes(source);
  const glossary = glossaryFile(exportManifest);
  if (glossary === null) warnings.push('Глосарію немає: модуль створено порожнім, імпортувати нічого');

  const practicalPoints = course.grading.categories.find((category) => category.id === 'practicals')?.pointsPerItem ?? 3;
  const sections = [
    {
      num: 0,
      name: 'Про курс',
      summary: `<p>${escapeHtml(course.title)} — ${escapeHtml(course.educationLevel)}, ${escapeHtml(course.credits)} кредити ЄКТС.</p>`,
      activities: [
        { type: 'page', ref: 'page:about', name: 'Про курс: силабус, оцінювання, політики', content: aboutPageHtml(course, site) },
        {
          type: 'url',
          ref: 'url:site',
          name: 'Сайт курсу',
          url: site,
          description: '<p>Лекції, тренажери, тренувальні тести, флеш-картки й профіль прогресу.</p>',
        },
        {
          type: 'glossary',
          ref: 'glossary:course',
          name: GLOSSARY_NAME,
          intro: glossaryIntroHtml(glossary?.total ?? 0),
          importFile: glossary?.file ?? null,
          expectedEntries: glossary?.total ?? 0,
        },
        caseProjectActivity({ grading: course.grading, warnings }),
        finalQuizActivity({ grading: course.grading, kind, pools, start, calendar: course.calendar, warnings }),
      ],
    },
    ...course.modules.map((module, index) => {
      const topics = course.topics.filter((topic) => topic.module === module.id);
      const practicals = course.practicals.filter((practical) => practical.module === module.id);
      return {
        num: index + 1,
        name: `Модуль ${moduleNumber(module.id)}. ${module.title}`,
        summary: `<p>Теми: ${escapeHtml(topics.map((topic) => topicNumber(topic.id)).join(', '))}.</p>`,
        activities: [
          ...topics.flatMap((topic) => topicActivities({ topic, book: books.get(topic.id), site, warnings })),
          ...practicals.flatMap((practical) => [
            practicalActivity({ practical, site, points: practicalPoints, warnings }),
            ...scormPackages.filter((pkg) => pkg.practical === practical.id).map(scormActivity),
          ]),
          moduleQuizActivity({
            module,
            topics,
            grading: course.grading,
            kind,
            pools,
            start,
            calendar: course.calendar,
            warnings,
          }),
        ],
      };
    }),
  ];

  const refs = sections.flatMap((section) => section.activities.map((activity) => activity.ref));
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: 'tools/moodle/build-plan.mjs',
    generatedAt: new Date().toISOString(),
    site,
    course: {
      fullname: course.title,
      shortname,
      summary: `<p>${escapeHtml(course.annotation)}</p>`,
      lang: course.language ?? 'uk',
      format: 'topics',
      numsections: course.modules.length,
    },
    bank: {
      name: BANK_NAME,
      quizKind: kind,
      moduleRoot: bankRootIdnumber(kind, 'module'),
      finalRoot: bankRootIdnumber(kind, 'final'),
      pools: source.map((file) => file.pool ?? 'module'),
      files: files.map((file) => ({ file: file.file, kind: file.kind, total: file.total })),
      quizFiles: source.map((file) => file.file),
    },
    glossaryImport: glossary === null ? null : { file: glossary.file, entries: glossary.total },
    startDate: start.toISOString().slice(0, 10),
    stats: {
      modules: course.modules.length,
      topics: course.topics.length,
      topicsWithBook: books.size,
      practicals: course.practicals.length,
      scormPackages: scormPackages.length,
    },
    sections,
    gradebook: { categories: gradebookPlan(course.grading, refs) },
    warnings,
  };
}

async function readJsonOrNull(path) {
  return readFile(path, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);
}

/**
 * Маніфести експорту: основний (тренувальні банки й глосарій) плюс маніфести з підкаталогів
 * `control-*` — контрольні банки експортуються в окремий каталог, бо живуть в іншому репозиторії.
 */
async function readManifests(artifacts) {
  const main = await readJsonOrNull(join(artifacts, 'manifest.json'));
  const entries = await readdir(artifacts, { withFileTypes: true }).catch(() => []);
  const extra = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('control-'))
      .map(async (entry) => ({ prefix: entry.name, manifest: await readJsonOrNull(join(artifacts, entry.name, 'manifest.json')) })),
  );
  return {
    questions: [
      ...(main?.questions ?? []),
      ...extra.flatMap(({ prefix, manifest }) =>
        (manifest?.questions ?? []).map((question) => ({ ...question, file: `${prefix}/${question.file}` })),
      ),
    ],
    glossaries: main?.glossaries ?? [],
  };
}

async function main(argv) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      course: { type: 'string' },
      artifacts: { type: 'string' },
      out: { type: 'string' },
      shortname: { type: 'string' },
      start: { type: 'string' },
      site: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const courseFile = values.course === undefined ? join(ROOT, 'content/course.yaml') : resolve(values.course);
  const artifacts = resolve(values.artifacts ?? join(ROOT, 'dist-export/moodle'));
  const outFile = values.out === undefined ? join(artifacts, 'plan.json') : resolve(values.out);

  const parsed = CourseSchema.safeParse(parse(await readFile(courseFile, 'utf8')));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    process.stderr.write(`Реєстр курсу ${courseFile} не проходить валідацію:\n${problems}\n`);
    return 1;
  }
  const start =
    values.start === undefined ? defaultStartDate() : new Date(`${values.start}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    process.stderr.write('Параметр --start має бути датою YYYY-MM-DD\n');
    return 2;
  }

  const plan = buildPlan({
    course: parsed.data,
    exportManifest: await readManifests(artifacts),
    booksManifest: await readJsonOrNull(join(artifacts, 'books', 'books.json')),
    scormIndex: await readJsonOrNull(join(artifacts, 'scorm', 'scorm.json')),
    site: values.site ?? (await readSiteUrl(join(ROOT, 'astro.config.mjs'))),
    shortname: values.shortname ?? DEFAULT_SHORTNAME,
    start,
  });
  await writeFile(outFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  const activities = plan.sections.reduce((total, section) => total + section.activities.length, 0);
  process.stdout.write(`План курсу: розділів ${plan.sections.length}, елементів ${activities} → ${outFile}\n`);
  for (const warning of plan.warnings) process.stdout.write(`  увага: ${warning}\n`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
