import type { CourseDraft } from './course';
import { LECTURE_HOURS } from './course-calendar';
import { sum, type Report } from './course-shared';

/** Години сходяться: кредити → 120 год; теми → 32 лек. і 72 СРС; практичні → 16 год. */

export const HOURS_PER_CREDIT = 30;

export function checkHours(course: CourseDraft, report: Report): void {
  const { total, lectures, practicals, selfStudy } = course.hours;
  if (lectures + practicals + selfStudy !== total) {
    report(`Сума годин (${lectures + practicals + selfStudy}) не дорівнює загальній кількості (${total})`, ['hours']);
  }
  if (course.credits * HOURS_PER_CREDIT !== total) {
    report(`${course.credits} кредит(и) ЄКТС = ${course.credits * HOURS_PER_CREDIT} год, а вказано ${total}`, ['credits']);
  }

  const topicLectures = sum(course.topics.map((t) => t.hours.lectures));
  if (topicLectures !== lectures) {
    report(`Сума лекційних годин тем (${topicLectures}) не дорівнює годинам лекцій курсу (${lectures})`, ['topics']);
  }
  const topicSelfStudy = sum(course.topics.map((t) => t.hours.selfStudy));
  if (topicSelfStudy !== selfStudy) {
    report(`Сума годин СРС тем (${topicSelfStudy}) не дорівнює годинам СРС курсу (${selfStudy})`, ['topics']);
  }
  const practicalHours = sum(course.practicals.map((p) => p.hours));
  if (practicalHours !== practicals) {
    report(`Сума годин практичних робіт (${practicalHours}) не дорівнює годинам практичних занять курсу (${practicals})`, ['practicals']);
  }

  course.topics.forEach((topic, index) => {
    if (topic.hours.lectures % LECTURE_HOURS !== 0) {
      report(`Тема ${topic.id}: лекційні години (${topic.hours.lectures}) мають складатися з цілих лекцій по ${LECTURE_HOURS} год`, ['topics', index, 'hours']);
    }
    const taskHours = sum(topic.selfStudyTasks.map((task) => task.hours));
    if (taskHours !== topic.hours.selfStudy) {
      report(`Тема ${topic.id}: сума годин завдань СРС (${taskHours}) не дорівнює годинам СРС теми (${topic.hours.selfStudy})`, ['topics', index, 'selfStudyTasks']);
    }
  });
}
