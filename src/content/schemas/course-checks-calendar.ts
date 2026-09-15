import type { CourseDraft } from './course';
import { LECTURE_HOURS, type CalendarActivity } from './course-calendar';
import type { Report } from './course-shared';

/** Календарний план узгоджений з реєстрами: тижні підряд, лекції = години тем, порядок практичних, тестів і етапів. */

type Scheduled<T extends CalendarActivity['type']> = Extract<CalendarActivity, { type: T }> & { week: number };
const PATH = ['calendar'];

function scheduled<T extends CalendarActivity['type']>(course: CourseDraft, type: T): Array<Scheduled<T>> {
  return course.calendar.schedule.flatMap((entry) =>
    entry.activities.filter((activity): activity is Extract<CalendarActivity, { type: T }> => activity.type === type).map((activity) => ({ ...activity, week: entry.week })),
  );
}

export function checkCalendar(course: CourseDraft, report: Report): void {
  checkWeeks(course, report);
  const lectures = scheduled(course, 'lecture');
  const lectureWeeks = (topic: string) => lectures.filter((lecture) => lecture.topic === topic).map((lecture) => lecture.week);
  checkLectures(course, lectures, report);
  checkPracticalSlots(course, lectureWeeks, report);
  checkModuleTests(course, lectureWeeks, report);
  checkCaseStages(course, report);
}

function checkWeeks(course: CourseDraft, report: Report): void {
  const weeks = course.calendar.schedule.map((entry) => entry.week);
  for (let week = 1; week <= course.calendar.weeks; week += 1) {
    const occurrences = weeks.filter((w) => w === week).length;
    if (occurrences === 0) report(`Календарний план: тиждень ${week} відсутній`, PATH);
    if (occurrences > 1) report(`Календарний план: тиждень ${week} повторюється`, PATH);
  }
  for (const week of weeks.filter((w) => w > course.calendar.weeks)) {
    report(`Календарний план: тиждень ${week} виходить за межі ${course.calendar.weeks} тижнів`, PATH);
  }
}

function checkLectures(course: CourseDraft, lectures: ReadonlyArray<Scheduled<'lecture'>>, report: Report): void {
  const topicIds = new Set(course.topics.map((t) => t.id));
  for (const lecture of lectures.filter((l) => !topicIds.has(l.topic))) report(`Календар: лекція з невідомої теми «${lecture.topic}»`, PATH);
  for (const topic of course.topics) {
    const count = lectures.filter((lecture) => lecture.topic === topic.id).length;
    if (count * LECTURE_HOURS !== topic.hours.lectures) {
      report(`Тема ${topic.id}: у календарі ${count} лекц. (${count * LECTURE_HOURS} год), а в темі заявлено ${topic.hours.lectures} год лекцій`, PATH);
    }
  }
}

function checkOnce(ids: readonly string[], expected: readonly string[], label: string, report: Report): void {
  for (const id of expected) {
    const count = ids.filter((candidate) => candidate === id).length;
    if (count !== 1) report(`${label} ${id} має бути в календарі рівно 1 раз, а трапляється ${count}`, PATH);
  }
  for (const id of new Set(ids.filter((candidate) => !expected.includes(candidate)))) report(`Календар посилається на невідоме: ${label} «${id}»`, PATH);
}

function checkPracticalSlots(course: CourseDraft, lectureWeeks: (topic: string) => number[], report: Report): void {
  const slots = scheduled(course, 'practical');
  checkOnce(slots.map((s) => s.practical), course.practicals.map((p) => p.id), 'Практична', report);
  for (const slot of slots) {
    const practical = course.practicals.find((p) => p.id === slot.practical);
    for (const topic of practical?.topics ?? []) {
      const first = Math.min(...lectureWeeks(topic));
      if (Number.isFinite(first) && slot.week < first) {
        report(`Практична ${slot.practical} (тиждень ${slot.week}) запланована раніше за першу лекцію теми ${topic} (тиждень ${first})`, PATH);
      }
    }
  }
}

function checkModuleTests(course: CourseDraft, lectureWeeks: (topic: string) => number[], report: Report): void {
  const tests = scheduled(course, 'module-test');
  checkOnce(tests.map((t) => t.module), course.modules.map((m) => m.id), 'Модульний тест', report);
  for (const test of tests) {
    const weeks = course.topics.filter((t) => t.module === test.module).flatMap((t) => lectureWeeks(t.id));
    const last = Math.max(...weeks);
    if (Number.isFinite(last) && test.week < last) {
      report(`Модульний тест ${test.module} (тиждень ${test.week}) запланований раніше за останню лекцію модуля (тиждень ${last})`, PATH);
    }
  }

  const finals = scheduled(course, 'final-test');
  if (finals.length !== 1) report(`Підсумковий тест має бути в календарі рівно 1 раз, а трапляється ${finals.length}`, PATH);
  for (const final of finals) {
    for (const test of tests.filter((t) => t.week > final.week)) {
      report(`Підсумковий тест (тиждень ${final.week}) запланований раніше за модульний тест ${test.module} (тиждень ${test.week})`, PATH);
    }
  }
}

function checkCaseStages(course: CourseDraft, report: Report): void {
  const stageIds = course.grading.caseProject.stages.map((stage) => stage.id);
  const slots = scheduled(course, 'case-project');
  checkOnce(slots.map((s) => s.stage), stageIds, 'Етап кейс-проєкту', report);
  let previousWeek = 0;
  for (const stage of stageIds) {
    const week = slots.find((slot) => slot.stage === stage)?.week;
    if (week === undefined) continue;
    if (week < previousWeek) report(`Етап кейс-проєкту ${stage} (тиждень ${week}) порушує порядок етапів`, PATH);
    previousWeek = Math.max(previousWeek, week);
  }
}
