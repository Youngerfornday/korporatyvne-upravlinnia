import type { FileChild } from 'docx';
import type { CalendarActivity } from '../../../src/content/schemas/course-calendar.ts';
import { LECTURE_HOURS } from '../../../src/content/schemas/course-calendar.ts';
import type { Course } from '../../../src/content/schemas/course.ts';
import { TABLE_SIZE, list, para, spacer, table, type DocSection } from './blocks.ts';
import { moduleNumber, practicalNumber, topicNumber, type DocContext } from './context.ts';
import { regulationRef } from './assessment.ts';

/** Політики курсу й календарний план. */

export function policiesSection(ctx: DocContext): DocSection {
  const { course } = ctx;
  const { policies } = course;
  const titled = (title: string, text: string): FileChild => para([{ text: `${title}. `, bold: true }, text]);
  return {
    title: 'Політики курсу',
    children: [
      titled('Відвідування', policies.attendance),
      titled('Дедлайни', policies.deadlines),
      titled('Академічна доброчесність', policies.academicIntegrity),
      para([{ text: 'Використання штучного інтелекту. ', bold: true }, 'Модель — ', ctx.mark('aiModel', `«${policies.aiModel.title}»`), '. ', policies.ai]),
      para(policies.aiModel.rationale),
      ...list(policies.aiModel.rules, 'bullets'),
      titled('Перескладання', policies.retakes),
      titled('Додаткові бали', policies.bonusPoints),
      para([{ text: 'Визнання результатів неформальної освіти. ', bold: true }, ctx.mark('nonFormalEducation', policies.nonFormalEducation.value)]),
      para([{ text: 'Нормативна основа: ', bold: true }, `${policies.basis.map((ref) => regulationRef(course, ref)).join('; ')}.`]),
    ],
  };
}

export function activityLabel(course: Course, activity: CalendarActivity): string {
  switch (activity.type) {
    case 'lecture': {
      const number = topicNumber(course, activity.topic);
      return `Лекція (${LECTURE_HOURS} год): Тема ${number}. ${course.topics[number - 1]?.title ?? activity.topic}`;
    }
    case 'practical': {
      const number = practicalNumber(course, activity.practical);
      const practical = course.practicals[number - 1];
      return `Практична робота ${number} (${practical?.hours ?? 0} год): ${practical?.title ?? activity.practical}`;
    }
    case 'module-test':
      return `Модульний тест: модуль ${moduleNumber(course, activity.module)}`;
    case 'case-project':
      return `Кейс-проєкт: ${course.grading.caseProject.stages.find((stage) => stage.id === activity.stage)?.title ?? activity.stage}`;
    case 'final-test':
      return 'Підсумковий тест';
  }
}

export function calendarSection(ctx: DocContext): DocSection {
  const { course } = ctx;
  return {
    title: 'Календарний план',
    children: [
      para(course.calendar.note),
      table(
        [
          { header: 'Тиждень', share: 14, align: 'center' },
          { header: 'Види робіт', share: 86 },
        ],
        course.calendar.schedule.map((week) => [String(week.week), { paragraphs: week.activities.map((activity) => para(activityLabel(course, activity), { indent: false, align: 'left', size: TABLE_SIZE, spacingAfter: 0 })) }]),
      ),
      spacer(),
    ],
  };
}
