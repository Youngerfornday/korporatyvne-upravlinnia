import type { CourseDraft } from './course';
import { MAX_POINTS, PERCENT } from './course-assessment';
import { rubricTotal } from './course-practicals';
import { reportDuplicates, sum, type Report } from './course-shared';
import { BloomLevelSchema } from './questions';

/** Бали сходяться: 60/40, рубрики = бали категорій, баланс Блума = кількість питань, поріг допуску. */

const EPSILON = 1e-9;
const PASS_GRADE = 'E';

type Category = CourseDraft['grading']['categories'][number];

function category(course: CourseDraft, id: string, report: Report): Category | undefined {
  const found = course.grading.categories.find((c) => c.id === id);
  if (!found) report(`У журналі оцінок немає категорії «${id}»`, ['grading', 'categories']);
  return found;
}

export function checkGrading(course: CourseDraft, report: Report): void {
  const { split, categories } = course.grading;
  reportDuplicates(categories.map((c) => c.id), 'ID категорії оцінювання', ['grading', 'categories'], report);

  if (split.current + split.final !== MAX_POINTS) {
    report(`Розподіл балів ${split.current}/${split.final} не дає ${MAX_POINTS}`, ['grading', 'split']);
  }
  for (const stage of ['current', 'final'] as const) {
    const stageSum = sum(categories.filter((c) => c.stage === stage).map((c) => c.items * c.pointsPerItem));
    if (Math.abs(stageSum - split[stage]) > EPSILON) {
      report(`Сума балів етапу ${stage} (${stageSum}) не дорівнює ${split[stage]}`, ['grading', 'categories']);
    }
  }

  checkPracticalRubrics(course, report);
  checkModuleTests(course, report);
  checkFinalTest(course, report);
  checkCaseProject(course, report);
  checkAdmissionAndBonus(course, report);
}

function checkPracticalRubrics(course: CourseDraft, report: Report): void {
  const practicals = category(course, 'practicals', report);
  if (!practicals) return;
  if (practicals.items !== course.practicals.length) {
    report(`Кількість практичних у журналі (${practicals.items}) не дорівнює кількості практичних робіт (${course.practicals.length})`, ['grading', 'categories']);
  }
  course.practicals.forEach((practical, index) => {
    const total = rubricTotal(practical.rubric);
    if (Math.abs(total - practicals.pointsPerItem) > EPSILON) {
      report(`Практична ${practical.id}: сума балів рубрики (${total}) не дорівнює балам за практичну (${practicals.pointsPerItem})`, ['practicals', index, 'rubric']);
    }
  });
}

function checkModuleTests(course: CourseDraft, report: Report): void {
  const { moduleTests } = course.grading;
  const path = ['grading', 'moduleTests'];
  const bloomTotal = sum(BloomLevelSchema.options.map((level) => moduleTests.bloom[level]));
  if (bloomTotal !== moduleTests.questions) {
    report(`Баланс Блума модульного тесту (${bloomTotal}) не дорівнює кількості питань (${moduleTests.questions})`, path);
  }
  if (moduleTests.bankPerModule < moduleTests.questions) {
    report(`Розмір банку модуля (${moduleTests.bankPerModule}) менший за кількість питань тесту (${moduleTests.questions})`, path);
  }
  const tests = category(course, 'module-tests', report);
  if (tests && tests.items !== course.modules.length) {
    report(`Кількість модульних тестів у журналі (${tests.items}) не дорівнює кількості модулів (${course.modules.length})`, path);
  }
}

function checkFinalTest(course: CourseDraft, report: Report): void {
  const { finalTest } = course.grading;
  const path = ['grading', 'finalTest'];
  const topicIds = new Set(course.topics.map((t) => t.id));
  const matrixTopics = finalTest.matrix.map((row) => row.topic);

  reportDuplicates(matrixTopics, 'теми в матриці підсумкового тесту', path, report);
  for (const topic of matrixTopics.filter((id) => !topicIds.has(id))) report(`Матриця підсумкового тесту містить невідому тему «${topic}»`, path);
  for (const topic of [...topicIds].filter((id) => !matrixTopics.includes(id))) report(`Матриця підсумкового тесту не містить теми ${topic}`, path);

  const levels = BloomLevelSchema.options;
  const levelTotals = levels.map((level) => sum(finalTest.matrix.map((row) => row[level])));
  const total = sum(levelTotals);
  if (total !== finalTest.questions) report(`Сума матриці підсумкового тесту (${total}) не дорівнює кількості питань (${finalTest.questions})`, path);
  if (finalTest.bankSize < finalTest.questions) {
    report(`Розмір банку підсумкового тесту (${finalTest.bankSize}) менший за кількість питань (${finalTest.questions})`, path);
  }

  const targetTotal = sum(levels.map((level) => finalTest.targetShare[level]));
  if (targetTotal !== PERCENT) report(`Цільові частки рівнів Блума дають ${targetTotal}%, а не ${PERCENT}%`, path);
  const tolerance = PERCENT / finalTest.questions;
  levels.forEach((level, index) => {
    const share = total === 0 ? 0 : ((levelTotals[index] ?? 0) / total) * PERCENT;
    if (Math.abs(share - finalTest.targetShare[level]) > tolerance + EPSILON) {
      report(`Частка рівня ${level} (${share}%) відхиляється від цільової ${finalTest.targetShare[level]}% більше ніж на одне питання`, path);
    }
  });
}

function checkCaseProject(course: CourseDraft, report: Report): void {
  const { caseProject } = course.grading;
  const path = ['grading', 'caseProject'];
  const stageIds = caseProject.stages.map((stage) => stage.id);
  reportDuplicates(stageIds, 'ID етапу кейс-проєкту', path, report);
  for (const criterion of caseProject.rubric.filter((c) => !stageIds.includes(c.stage))) {
    report(`Критерій «${criterion.title}» кейс-проєкту посилається на невідомий етап «${criterion.stage}»`, path);
  }
  for (const stage of stageIds.filter((id) => !caseProject.rubric.some((c) => c.stage === id))) {
    report(`Етап кейс-проєкту «${stage}» не має жодного критерію рубрики`, path);
  }
  const project = category(course, 'case-project', report);
  const total = rubricTotal(caseProject.rubric);
  if (project && Math.abs(total - project.items * project.pointsPerItem) > EPSILON) {
    report(`Сума балів рубрики кейс-проєкту (${total}) не дорівнює балам у журналі (${project.items * project.pointsPerItem})`, path);
  }
}

function checkAdmissionAndBonus(course: CourseDraft, report: Report): void {
  const { admission, bonus, split } = course.grading;
  const passMin = course.scale.find((band) => band.ects === PASS_GRADE)?.min;
  if (passMin === undefined) {
    report(`Шкала не містить оцінки ${PASS_GRADE}, від якої рахується поріг допуску`, ['scale']);
  } else if (admission.minCurrentPoints !== passMin - split.final) {
    report(
      `Поріг допуску (${admission.minCurrentPoints}) має дорівнювати ${passMin - split.final}: мінімум ${PASS_GRADE} (${passMin}) мінус бали підсумкового контролю (${split.final})`,
      ['grading', 'admission'],
    );
  }
  bonus.activities.forEach((activity, index) => {
    if (activity.maxPoints > bonus.maxPoints) {
      report(`Додаткові бали за «${activity.title}» (${activity.maxPoints}) перевищують загальний ліміт додаткових балів (${bonus.maxPoints})`, ['grading', 'bonus', 'activities', index]);
    }
  });
}

export function checkScale(course: CourseDraft, report: Report): void {
  const bands = [...course.scale].sort((a, b) => a.min - b.min);
  let expectedMin = 0;
  for (const band of bands) {
    if (band.min > band.max || band.min !== expectedMin) {
      report(`Шкала оцінювання має розрив або перекриття біля ${band.min}–${band.max} (${band.ects})`, ['scale']);
      return;
    }
    expectedMin = band.max + 1;
  }
  if (expectedMin !== MAX_POINTS + 1) report(`Шкала оцінювання не покриває діапазон 0–${MAX_POINTS}`, ['scale']);
}
