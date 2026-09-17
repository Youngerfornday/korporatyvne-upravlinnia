import type { Document } from 'docx';
import type { Course } from '../../../src/content/schemas/course.ts';
import { para, renderSections, type DocSection } from './blocks.ts';
import { createContext, type DocContext, type DocOptions } from './context.ts';
import { courseDocument } from './document.ts';
import { annotationSection, generalSection, goalSection, requisitesSection, syllabusHeader } from './general.ts';
import { literatureSection } from './literature.ts';
import { outcomesSection } from './outcomes.ts';
import { assessmentSection } from './assessment.ts';
import { calendarSection, policiesSection } from './policies.ts';
import { hoursTable, practicalPlanTable, topicOverview } from './structure.ts';

/**
 * Силабус — документ для студента за Положенням про робочі програми та силабуси: загальна інформація,
 * анотація, мета, результати навчання, структура й зміст, оцінювання, політики, календар, література.
 */

export const SYLLABUS_SECTION_TITLES = [
  'Загальна інформація про дисципліну',
  'Анотація дисципліни',
  'Мета та завдання дисципліни',
  'Компетентності та програмні результати навчання',
  'Пререквізити та постреквізити',
  'Структура та зміст дисципліни',
  'Оцінювання результатів навчання',
  'Політики курсу',
  'Календарний план',
  'Рекомендована література та інформаційні ресурси',
] as const;

function structureSection(ctx: DocContext): DocSection {
  return {
    title: 'Структура та зміст дисципліни',
    subsections: [
      { title: 'Обсяг і розподіл годин', children: hoursTable(ctx) },
      { title: 'Зміст тем', children: topicOverview(ctx) },
      {
        title: 'Практичні роботи',
        children: [para('Кожна практична робота має тренажер на сайті курсу й оцінюється за рубрикою в Moodle.'), ...practicalPlanTable(ctx)],
      },
    ],
  };
}

export function buildSyllabus(course: Course, options: DocOptions): Document {
  const ctx = createContext(course, options);
  const sections: DocSection[] = [
    generalSection(ctx),
    annotationSection(ctx),
    goalSection(ctx),
    outcomesSection(ctx, { detailed: false }),
    requisitesSection(ctx),
    structureSection(ctx),
    assessmentSection(ctx, { rubrics: false }),
    policiesSection(ctx),
    calendarSection(ctx),
    literatureSection(ctx),
  ];
  const children = [...syllabusHeader(ctx), ...renderSections(sections)];
  return courseDocument(
    {
      title: `Силабус навчальної дисципліни «${course.title}»`,
      subject: `${course.program.educationalProgram}; ${course.educationLevel}`,
      description: `Силабус дисципліни «${course.title}», ${course.institutionShort}. Згенеровано з content/course.yaml.`,
      keywords: 'силабус, корпоративне управління, бакалавр, менеджмент',
    },
    children,
    ctx.placedNotes(),
    options.date,
  );
}
