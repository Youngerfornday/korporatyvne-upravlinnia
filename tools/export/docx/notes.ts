import { Paragraph, TextRun, type ICommentOptions } from 'docx';
import type { Course } from '../../../src/content/schemas/course.ts';
import { typo } from '../../../src/lib/typography/index.ts';
import type { Inline } from './blocks.ts';

/**
 * Примітки Word до значень, які має погодити замовник: поля course.yaml з `needsConfirmation: true`,
 * плейсхолдер викладача і назва кафедри, якої в реєстрі курсу немає. Текст значення виділяється жовтим,
 * а в примітці пояснено, що саме звірити.
 */

export type NoteKey =
  | 'specialtyRecord'
  | 'disciplineStatus'
  | 'finalControl'
  | 'semester'
  | 'volume'
  | 'aiModel'
  | 'nonFormalEducation'
  | 'teacher'
  | 'department';

export interface Note {
  readonly key: NoteKey;
  readonly subject: string;
  readonly text: string;
}

/** Примітка, прив'язана до конкретного місця документа: у Word кожен ID коментаря — одне місце. */
export interface PlacedNote extends Note {
  readonly id: number;
}

export const NOTE_AUTHOR = 'Конвеєр матеріалів курсу';
const NOTE_INITIALS = 'КМ';

interface Candidate {
  readonly key: NoteKey;
  readonly subject: string;
  readonly needed: boolean;
  readonly text: string | undefined;
}

function candidates(course: Course): Candidate[] {
  const { program, policies, teacher } = course;
  const confirmable = (key: NoteKey, subject: string, field: { needsConfirmation: boolean; note?: string | undefined }): Candidate => ({
    key,
    subject,
    needed: field.needsConfirmation,
    text: field.note,
  });
  return [
    confirmable('specialtyRecord', 'Спеціальність', program.specialtyRecord),
    confirmable('disciplineStatus', 'Статус дисципліни', program.disciplineStatus),
    confirmable('finalControl', 'Форма семестрового контролю', program.finalControl),
    confirmable('semester', 'Курс і семестр', program.semester),
    confirmable('volume', 'Обсяг дисципліни', program.volume),
    confirmable('aiModel', 'Політика щодо ШІ', policies.aiModel),
    confirmable('nonFormalEducation', 'Визнання результатів неформальної освіти', policies.nonFormalEducation),
    {
      key: 'teacher',
      subject: 'Дані викладача',
      needed: teacher.isPlaceholder,
      text: 'Дані викладача — плейсхолдер: ПІБ, посаду, науковий ступінь і контакти вносить кафедра перед затвердженням.',
    },
    {
      key: 'department',
      subject: 'Кафедра',
      needed: true,
      text: 'Назви кафедри немає в content/course.yaml — вписати кафедру, що забезпечує викладання дисципліни.',
    },
  ];
}

/** Поля, що потребують погодження, у сталому порядку. */
export function collectNotes(course: Course): Note[] {
  return candidates(course)
    .filter((candidate) => candidate.needed)
    .map((candidate) => ({ key: candidate.key, subject: candidate.subject, text: candidate.text ?? 'Звірити значення із замовником.' }));
}

export interface NoteMarker {
  /** Значення з приміткою, якщо поле потребує погодження, інакше — простий текст. Кожен виклик — нова примітка. */
  readonly mark: (key: NoteKey, text: string) => Inline;
  /** Примітки в порядку появи в документі: ID послідовні, тож однаковий course.yaml дає однаковий документ. */
  readonly placed: () => readonly PlacedNote[];
}

export function createNoteMarker(notes: readonly Note[]): NoteMarker {
  const placed: PlacedNote[] = [];
  return {
    mark: (key, text) => {
      const note = notes.find((candidate) => candidate.key === key);
      if (note === undefined) return text;
      const id = placed.length;
      placed.push({ ...note, id });
      return { text, comment: id };
    },
    placed: () => [...placed],
  };
}

export function commentOptions(notes: readonly PlacedNote[], date: Date): ICommentOptions[] {
  return notes.map((note) => ({
    id: note.id,
    author: NOTE_AUTHOR,
    initials: NOTE_INITIALS,
    date,
    children: [
      new Paragraph({ children: [new TextRun({ text: `Потребує погодження — ${note.subject}.`, bold: true })] }),
      new Paragraph({ children: [new TextRun(typo(note.text))] }),
    ],
  }));
}
