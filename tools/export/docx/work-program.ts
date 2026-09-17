import type { Document } from 'docx';
import type { Course } from '../../../src/content/schemas/course.ts';
import { renderSections, type DocSection } from './blocks.ts';
import { createContext, type DocOptions } from './context.ts';
import { courseDocument } from './document.ts';
import { annotationSection, generalSection, goalSection, requisitesSection, workProgramTitlePage } from './general.ts';
import { literatureSection } from './literature.ts';
import { outcomesSection } from './outcomes.ts';
import { assessmentSection } from './assessment.ts';
import { calendarSection, policiesSection } from './policies.ts';
import { hoursTable, lecturePlanTable, practicalDetails, practicalPlanTable, selfStudyTable } from './structure.ts';

/**
 * Робоча програма навчальної дисципліни (РПНД): титульна сторінка, опис дисципліни, анотація, мета й завдання,
 * компетентності й ПРН з матрицею, пререквізити, обсяг і структура годин за темами, тематичні плани лекцій
 * і практичних, СРС, оцінювання з розподілом балів, рубриками й шкалою, політики, календар, література.
 */

export const WORK_PROGRAM_SECTION_TITLES = [
  'Загальна інформація про дисципліну',
  'Анотація дисципліни',
  'Мета та завдання дисципліни',
  'Компетентності та програмні результати навчання',
  'Пререквізити та постреквізити',
  'Обсяг і структура дисципліни',
  'Тематичний план лекційних занять',
  'Тематичний план практичних занять',
  'Самостійна робота студентів',
  'Оцінювання результатів навчання',
  'Політики курсу',
  'Календарний план',
  'Рекомендована література та інформаційні ресурси',
] as const;

export function buildWorkProgram(course: Course, options: DocOptions): Document {
  const ctx = createContext(course, options);
  const titlePage = workProgramTitlePage(ctx);
  const sections: DocSection[] = [
    generalSection(ctx),
    annotationSection(ctx),
    goalSection(ctx),
    outcomesSection(ctx, { detailed: true }),
    requisitesSection(ctx),
    { title: 'Обсяг і структура дисципліни', children: hoursTable(ctx) },
    { title: 'Тематичний план лекційних занять', children: lecturePlanTable(ctx) },
    { title: 'Тематичний план практичних занять', children: [...practicalPlanTable(ctx), ...practicalDetails(ctx)] },
    { title: 'Самостійна робота студентів', children: selfStudyTable(ctx) },
    assessmentSection(ctx, { rubrics: true }),
    policiesSection(ctx),
    calendarSection(ctx),
    literatureSection(ctx),
  ];
  const children = [...titlePage, ...renderSections(sections)];
  return courseDocument(
    {
      title: `Робоча програма навчальної дисципліни «${course.title}»`,
      subject: `${course.program.educationalProgram}; ${course.educationLevel}`,
      description: `Робоча програма дисципліни «${course.title}», ${course.institutionShort}. Згенеровано з content/course.yaml.`,
      keywords: 'робоча програма, корпоративне управління, бакалавр, менеджмент',
    },
    children,
    ctx.placedNotes(),
    options.date,
  );
}
