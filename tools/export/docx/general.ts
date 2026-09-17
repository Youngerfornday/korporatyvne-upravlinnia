import { AlignmentType, Paragraph, TextRun, type FileChild } from 'docx';
import { typo } from '../../../src/lib/typography/index.ts';
import { TABLE_SIZE, formatNumber, list, para, spacer, table, type CellContent, type DocSection, type Inline } from './blocks.ts';
import type { DocContext } from './context.ts';
import { planHours } from './structure.ts';

/** Титульна частина документів і загальна інформація про дисципліну. */

const DEPARTMENT_PLACEHOLDER = 'Кафедра уточнюється';
const CITY = 'Чернігів';

function centered(text: string, options: { bold?: boolean; size?: number; spacingAfter?: number; allCaps?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: options.spacingAfter ?? 120 },
    children: [new TextRun({ text: typo(text), bold: options.bold, size: options.size, allCaps: options.allCaps })],
  });
}

function blankLines(count: number): Paragraph[] {
  return Array.from({ length: count }, () => new Paragraph({ children: [] }));
}

function teacherText(ctx: DocContext): string {
  const { teacher } = ctx.course;
  return teacher.isPlaceholder ? `${teacher.name} (дані вносить кафедра)` : [teacher.name, teacher.position].filter(Boolean).join(', ');
}

function specialty(ctx: DocContext): Inline {
  return ctx.mark('specialtyRecord', ctx.course.program.specialtyRecord.value);
}

/** Службова примітка про походження документа й позначки для погодження. */
export function generatedNotice(ctx: DocContext): Paragraph {
  const status = ctx.course.status === 'draft' ? 'чернетка' : 'затверджено';
  return para(
    [
      { text: 'Службова примітка. ', bold: true },
      `Документ згенеровано автоматично з реєстру курсу content/course.yaml (статус: ${status}). ` +
        'Значення, виділені жовтим, мають примітки Word з поясненням, що саме потрібно погодити з кафедрою до затвердження.',
    ],
    { indent: false, size: TABLE_SIZE, align: 'left' },
  );
}

/** Титульна сторінка робочої програми за звичаєм університетських РПНД. */
export function workProgramTitlePage(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const { program } = course;
  const year = String(ctx.date.getUTCFullYear());
  return [
    centered('Міністерство освіти і науки України', { allCaps: true, spacingAfter: 0 }),
    centered(course.institution, { bold: true, spacingAfter: 0 }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [], spacing: { after: 0 } }),
    para([ctx.mark('department', DEPARTMENT_PLACEHOLDER)], { align: 'center', indent: false }),
    ...blankLines(2),
    para([{ text: 'ЗАТВЕРДЖУЮ', bold: true }], { align: 'right', indent: false, spacingAfter: 0 }),
    para('Завідувач кафедри ____________', { align: 'right', indent: false, spacingAfter: 0 }),
    para('«___» ____________ 20__ р.', { align: 'right', indent: false }),
    ...blankLines(3),
    centered('Робоча програма навчальної дисципліни', { bold: true, allCaps: true, spacingAfter: 60 }),
    centered(`«${course.title}»`, { bold: true, size: 32, spacingAfter: 360 }),
    para([{ text: 'Рівень вищої освіти: ', bold: true }, course.educationLevel], { indent: false, spacingAfter: 0, align: 'left' }),
    para([{ text: 'Галузь знань: ', bold: true }, program.fieldOfKnowledge], { indent: false, spacingAfter: 0, align: 'left' }),
    para([{ text: 'Спеціальність: ', bold: true }, specialty(ctx)], { indent: false, spacingAfter: 0, align: 'left' }),
    para([{ text: 'Освітня програма: ', bold: true }, program.educationalProgram], { indent: false, spacingAfter: 0, align: 'left' }),
    para([{ text: 'Статус дисципліни: ', bold: true }, ctx.mark('disciplineStatus', program.disciplineStatus.value)], {
      indent: false,
      spacingAfter: 0,
      align: 'left',
    }),
    para([{ text: 'Мова викладання: ', bold: true }, program.instructionLanguage], { indent: false, align: 'left' }),
    ...blankLines(6),
    centered(`${CITY} — ${year}`, { spacingAfter: 0 }),
    para([{ text: 'Розробник: ', bold: true }, ctx.mark('teacher', teacherText(ctx))], { indent: false, pageBreakBefore: true }),
    generatedNotice(ctx),
  ];
}

/** Шапка силабусу: без окремої титульної сторінки, одразу загальна інформація. */
export function syllabusHeader(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  return [
    centered(course.institution, { bold: true, spacingAfter: 0 }),
    para([ctx.mark('department', DEPARTMENT_PLACEHOLDER)], { align: 'center', indent: false }),
    centered('Силабус навчальної дисципліни', { bold: true, allCaps: true, spacingAfter: 60 }),
    centered(`«${course.title}»`, { bold: true, size: 32, spacingAfter: 240 }),
    generatedNotice(ctx),
  ];
}

function infoRows(ctx: DocContext): CellContent[][] {
  const { course } = ctx;
  const { program, hours } = course;
  const plan = planHours(course);
  return [
    ['Рівень вищої освіти', `${course.educationLevel}, ${program.nqfLevel} рівень НРК`],
    ['Галузь знань', program.fieldOfKnowledge],
    ['Спеціальність', [specialty(ctx)]],
    ['Освітня програма', program.educationalProgram],
    ['Кваліфікація', program.qualification],
    ['Статус дисципліни', [ctx.mark('disciplineStatus', program.disciplineStatus.value)]],
    ['Курс і семестр', [ctx.mark('semester', program.semester.value)]],
    ['Обсяг дисципліни', [ctx.mark('volume', program.volume.value)]],
    [
      'Розподіл годин',
      `лекції — ${formatNumber(hours.lectures)}, практичні заняття — ${formatNumber(hours.practicals)}, самостійна робота — ${formatNumber(hours.selfStudy)}; модулів — ${plan.modules.length}, тем — ${course.topics.length}`,
    ],
    ['Форма семестрового контролю', [ctx.mark('finalControl', program.finalControl.value)]],
    ['Мова викладання', program.instructionLanguage],
    ['Викладач', [ctx.mark('teacher', teacherText(ctx))]],
    ['Сайт курсу', [{ text: ctx.siteUrl, link: ctx.siteUrl }]],
  ];
}

export function generalSection(ctx: DocContext): DocSection {
  return {
    title: 'Загальна інформація про дисципліну',
    children: [
      table(
        [
          { header: 'Показник', share: 34 },
          { header: 'Значення', share: 66 },
        ],
        infoRows(ctx),
      ),
      spacer(),
    ],
  };
}

export function annotationSection(ctx: DocContext): DocSection {
  return { title: 'Анотація дисципліни', children: [para(ctx.course.annotation)] };
}

export function goalSection(ctx: DocContext): DocSection {
  return {
    title: 'Мета та завдання дисципліни',
    children: [
      para([{ text: 'Мета: ', bold: true }, ctx.course.goal]),
      para([{ text: 'Завдання:', bold: true }], { keepNext: true }),
      ...list(ctx.course.objectives, 'numbered', ctx.nextListInstance()),
    ],
  };
}

export function requisitesSection(ctx: DocContext): DocSection {
  const { program } = ctx.course;
  return {
    title: 'Пререквізити та постреквізити',
    children: [
      para([{ text: 'Пререквізити', bold: true }, ' — дисципліни й знання, потрібні для вивчення курсу:'], { keepNext: true }),
      ...list(program.prerequisites, 'bullets'),
      para([{ text: 'Постреквізити', bold: true }, ' — де знадобляться результати навчання:'], { keepNext: true }),
      ...list(program.postrequisites, 'bullets'),
    ],
  };
}
